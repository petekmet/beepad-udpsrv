// Keeps UDP port open for incoming messages
import { AesCmac } from "aes-cmac";
import { AddressInfo } from "net";
import { Connection, createConnection } from "ts-datastore-orm";
import { Device } from "../model/device";
import { createDownlinkMessage, messageWithMac } from "../utils/message-utils";
import { uplinkPacket, UplinkPacketHeader, uplinkPacketHeader } from "../utils/structbuffer";
import { processEmailAlerts } from "./email-service";
import { createMeasurementFromPacket, saveMeasurementForDevice } from "./measurement-service";
import logger from "../utils/logger";

// emits on new datagram msg
export async function apnServiceGetResponseBuffer(msg: Buffer, info: AddressInfo): Promise<Buffer | undefined> {
    // verify cmac
    // extract device address
    // extract packet type
    // extract cmac
    // calculate cmac
    // decode header
    // const packet = uplinkPacket.decode(msg, true);
    const packetHeader: UplinkPacketHeader = uplinkPacketHeader.decode(msg, true);
    const nbiotComposedAddress: string = msg.subarray(0, 16).toString("hex");
    logger.info("NB-IoT device composed address: %s", nbiotComposedAddress);
    // console.log("Decoded packet header:", packetHeader);

    // get device properties
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const d = await repostory.query().filter("address", nbiotComposedAddress).findOne();

    if (d) {
        let labels = {labels:{"device": d.address, "deviceName": d.name}};
        logger.info(
            "Device: %s %s %s", d._id, d.address, d.name,
            labels
            );
        // verify cmac
        const key = Buffer.from(d!.nwkSKey, "hex");
        const cmac = msg.subarray(msg.length - 4);
        const cmacNumber = cmac.readInt32LE();
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(msg.subarray(0, msg.length - 4));
        const calculatedCmacNumber: number = result.subarray(0, 4).readInt32LE();
        if (calculatedCmacNumber == cmacNumber || d.deviceClass == 4) {
            if (d.deviceClass == 4) {
                logger.warn("WARNING: Cmac check skipped, device class 4", labels);
            } else {
                logger.info("Cmac ok", labels);
            }
            const downlinkData = d?.downlinkData ? Buffer.from(d.downlinkData, "hex") : undefined;
            const packetPayload = msg.subarray(17); // skip header at pos 17
            return processUplinkData(connection, d, packetHeader, packetPayload, downlinkData);
        } else {
            logger.warn("WARNING: Device CMAC failure %s", nbiotComposedAddress, labels);
        }
    } else {
        logger.warn("WARNING: Device unknown %s", nbiotComposedAddress, {labels:{"device": nbiotComposedAddress}});
    }
}

function processUplinkData(
    connection: Connection,
    device: Device,
    packetHeader: UplinkPacketHeader,
    packetPayload: Buffer,
    downlinkData?: Buffer
): Buffer | undefined {
    if (packetHeader.packetType === 0) {
        let labels = {labels:{"device": device.address, "deviceName": device.name}};
        try {
            const packet = uplinkPacket.decode(new Uint8Array(packetPayload), true);
           logger.info("Decoded uplink packet type 0 %s", packet, labels);
            const measurement = createMeasurementFromPacket(packet, device);
            if (device.lastMeasurement && device.lastMeasurement.cnt == measurement.cnt) {
                logger.warn("WARNING: Device duplicate last cnt, no save", labels);
            } else {
                processEmailAlerts(connection, device, measurement);
                saveMeasurementForDevice(connection, device, measurement, packet.flags.downlinkRequest);

                if (packet.flags.downlinkRequest && downlinkData) {
                    const key = Buffer.from(device.nwkSKey, "hex");
                    return messageWithMac(createDownlinkMessage(packetHeader, downlinkData), key);
                }
                logger.info("Measurement on %s saved on %s", new Date(packet.measurementTimestamp * 1000), measurement.asOn, labels);
            }
        } catch {
            logger.warn("WARNING: could not decode packet", labels);
        }
    }
}
