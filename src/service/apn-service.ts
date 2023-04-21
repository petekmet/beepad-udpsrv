// Keeps UDP port open for incoming messages
import { AesCmac } from "aes-cmac";
import { AddressInfo } from "net";
import { Connection, createConnection } from "ts-datastore-orm";
import { Device } from "../model/device";
import { createDownlinkMessage, messageWithMac } from "../utils/message-utils";
import { uplinkPacket, UplinkPacketHeader, uplinkPacketHeader } from "../utils/structbuffer";
import { processEmailAlerts } from "./email-service";
import { createMeasurementFromPacket, saveMeasurementForDevice } from "./measurement-service";

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
    console.log("NB-IoT device composed address:", nbiotComposedAddress);
    // console.log("Decoded packet header:", packetHeader);

    // get device properties
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const d = await repostory.query().filter("address", nbiotComposedAddress).findOne();

    if (d) {
        console.log(new Date(), "Device:", d._id, d.address, d.name);
        // verify cmac
        const key = Buffer.from(d!.nwkSKey, "hex");
        const cmac = msg.subarray(msg.length - 4);
        const cmacNumber = cmac.readInt32LE();
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(msg.subarray(0, msg.length - 4));
        const calculatedCmacNumber: number = result.subarray(0, 4).readInt32LE();
        if (calculatedCmacNumber == cmacNumber || d.deviceClass == 4) {
            if (d.deviceClass == 4) {
                console.log("WARNING: Cmac check skipped, device class 4");
            } else {
                console.log("Cmac ok");
            }
            const downlinkData = d?.downlinkData ? Buffer.from(d.downlinkData, "hex") : undefined;
            const packetPayload = msg.subarray(17); // skip header at pos 17
            return processUplinkData(connection, d, packetHeader, packetPayload, downlinkData);
        } else {
            console.log("WARNING: Cmac verification failed");
        }
    } else {
        console.log("WARNING: unknown address", nbiotComposedAddress);
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
        try {
            const packet = uplinkPacket.decode(new Uint8Array(packetPayload), true);
            console.log("Decoded uplink packet type 0\n", packet);
            const measurement = createMeasurementFromPacket(packet, device);
            if (device.lastMeasurement && device.lastMeasurement.cnt == measurement.cnt) {
                console.log("WARNING: duplicate last cnt, no save")
            } else {
                processEmailAlerts(connection, device, measurement);
                saveMeasurementForDevice(connection, device, measurement);

                if (packet.flags.downlinkRequest || downlinkData) {
                    const key = Buffer.from(device.nwkSKey, "hex");
                    return messageWithMac(createDownlinkMessage(packetHeader, downlinkData), key);
                }
                console.log("Measurement on", new Date(packet.measurementTimestamp * 1000), "saved on", measurement.asOn);
            }
        } catch {
            console.log(new Date(), "WARNING: could not decode packet");
        }
    }
}
