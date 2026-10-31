// Keeps UDP port open for incoming messages
import { AesCmac } from "aes-cmac";
import { AddressInfo } from "net";
import { Connection, createConnection } from "ts-datastore-orm";
import { Device } from "../model/device";
import { createDownlinkMessage, messageWithMac } from "../utils/message-utils";
import { uplinkPacket, UplinkPacketHeader, uplinkPacketHeader } from "../utils/structbuffer";
import { processEmailAlerts } from "./email-service";
import { createMeasurementFromPacket, saveMeasurementForDevice } from "./measurement-service";
import logger, { evt } from "../utils/logger";
import { FwVersionTrailer, splitMeasurementFw, UPLINK_MEASUREMENT, UPLINK_MEASUREMENT_FW, UPLINK_SERVICE } from "../fw/fw-protocol";
import { offerFor, onServiceUplink, onVersionReport } from "../fw/fw-service";
import { DatastoreFwStore } from "../fw/fw-store";

// emits on new datagram msg
export async function apnServiceGetResponseBuffer(msg: Buffer, info: AddressInfo, trace: string): Promise<Buffer | undefined> {
    // verify cmac
    // extract device address
    // extract packet type
    // extract cmac
    // calculate cmac
    // decode header
    // const packet = uplinkPacket.decode(msg, true);
    const packetHeader: UplinkPacketHeader = uplinkPacketHeader.decode(msg, true);
    const nbiotComposedAddress: string = msg.subarray(0, 16).toString("hex");
    logger.info("NB-IoT device composed address: %s", nbiotComposedAddress, evt("uplink", { trace, device: nbiotComposedAddress }));
    // console.log("Decoded packet header:", packetHeader);

    // get device properties
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const d = await repostory.query().filter("address", nbiotComposedAddress).findOne();

    if (d) {
        const ctx = { trace, device: d.address, deviceName: d.name, deviceId: d._id };
        logger.info("Device: %s %s %s", d._id, d.address, d.name, evt("uplink", ctx));
        // verify cmac
        const key = Buffer.from(d!.nwkSKey, "hex");
        const cmac = msg.subarray(msg.length - 4);
        const cmacNumber = cmac.readInt32LE();
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(msg.subarray(0, msg.length - 4));
        const calculatedCmacNumber: number = result.subarray(0, 4).readInt32LE();
        if (calculatedCmacNumber == cmacNumber || d.deviceClass == 4) {
            if (d.deviceClass == 4) {
                logger.warn("WARNING: Cmac check skipped, device class 4", evt("cmac", ctx));
            } else {
                logger.info("Cmac ok", evt("cmac", ctx));
            }
            const downlinkData = d?.downlinkData ? Buffer.from(d.downlinkData, "hex") : undefined;
            const packetPayload = msg.subarray(17); // skip header at pos 17
            return processUplinkData(connection, d, packetHeader, packetPayload, trace, downlinkData);
        } else {
            logger.warn("WARNING: Device CMAC failure %s", nbiotComposedAddress, evt("cmac", ctx));
        }
    } else {
        logger.warn("WARNING: Device unknown %s", nbiotComposedAddress, evt("uplink", { trace, device: nbiotComposedAddress }));
    }
}

export async function processUplinkData(
    connection: Connection,
    device: Device,
    packetHeader: UplinkPacketHeader,
    packetPayload: Buffer,
    trace: string,
    downlinkData?: Buffer
): Promise<Buffer | undefined> {
    const ctx = { trace, device: device.address, deviceName: device.name, deviceId: device._id };
    const key = Buffer.from(device.nwkSKey, "hex");

    if (packetHeader.packetType === UPLINK_SERVICE) {
        // firmware update service packet: no measurement, no flags, always answered
        try {
            const reply = await onServiceUplink(new DatastoreFwStore(connection), device, packetPayload.subarray(0, packetPayload.length - 4), trace);
            return reply ? messageWithMac(createDownlinkMessage(packetHeader, reply), key) : undefined;
        } catch (e) {
            logger.error("FW service uplink failed: %s", (e as Error)?.stack ?? e, evt("fw", ctx));
            return undefined;
        }
    }

    if (packetHeader.packetType !== UPLINK_MEASUREMENT && packetHeader.packetType !== UPLINK_MEASUREMENT_FW) {
        logger.warn("WARNING: unknown packet type %d", packetHeader.packetType, evt("uplink", ctx));
        return undefined;
    }

    // packetType 2 = the type 0 measurement plus a firmware version trailer
    let measurementPayload = packetPayload;
    let version: FwVersionTrailer | undefined;
    if (packetHeader.packetType === UPLINK_MEASUREMENT_FW) {
        const split = splitMeasurementFw(packetPayload);
        if (!split) {
            logger.warn("WARNING: packet type 2 with bad length %d", packetPayload.length, evt("uplink", ctx));
            return undefined;
        }
        measurementPayload = split.measurement;
        version = split.version;
    }

    try {
        const packet = uplinkPacket.decode(new Uint8Array(measurementPayload), true);
        logger.info("Decoded uplink packet type %d %s", packetHeader.packetType, packet, evt("uplink", ctx));
        if (packet.flags.weatherSensorFault) {
            logger.warn("WARNING: BME280 weather sensor fault reported; temperature/humidity/pressure are invalid (0)", evt("uplink", ctx));
        }
        const measurement = createMeasurementFromPacket(packet, device, trace);
        const duplicate = !!device.lastMeasurement && device.lastMeasurement.cnt == measurement.cnt;
        if (duplicate) {
            logger.warn("WARNING: Device duplicate last cnt, no save", evt("uplink", ctx));
        }

        // firmware: runs for a duplicate cnt too, because the scale restarts its
        // counter at 0 on every boot, and the first uplink after a boot is the one
        // that reports a new version and asks for a downlink. A pending update
        // offer goes ahead of Device.downlinkData, which stays queued.
        let offer: Buffer | undefined;
        try {
            const fwStore = new DatastoreFwStore(connection);
            if (version) await onVersionReport(fwStore, device, version, trace);
            if (packet.flags.downlinkRequest) offer = await offerFor(fwStore, device, version, trace);
        } catch (e) {
            logger.error("FW version/offer handling failed: %s", (e as Error)?.stack ?? e, evt("fw", ctx));
        }

        if (!duplicate) {
            await processEmailAlerts(connection, device, measurement, trace);
            const sendDownlinkData = packet.flags.downlinkRequest && !offer;
            saveMeasurementForDevice(connection, device, measurement, sendDownlinkData, trace);
            if (!offer && sendDownlinkData && downlinkData) {
                return messageWithMac(createDownlinkMessage(packetHeader, downlinkData), key);
            }
            logger.info("Measurement on %s saved on %s", new Date(packet.measurementTimestamp * 1000), measurement.asOn, evt("measurement", ctx));
        }
        if (offer) {
            return messageWithMac(createDownlinkMessage(packetHeader, offer), key);
        }
    } catch {
        logger.warn("WARNING: could not decode packet", evt("uplink", ctx));
    }
}
