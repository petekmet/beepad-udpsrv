// Keeps UDP port open for incoming messages
import { AesCmac } from "aes-cmac";
import { AddressInfo } from "net";
import { Device } from "../model/device";
import { createConnection } from "ts-datastore-orm";
import { UplinkPacket, uplinkPacket, UplinkPacketHeader, uplinkPacketHeader } from "../utils/structbuffer";
import { messageWithMac } from "../utils/message-utils";
import { createDownlinkMessage } from "../utils/message-utils";
import { createMeasurementFromPacket, saveMeasurementForDevice } from "./measurement-service";
import { Measurement } from "../model/measurement.entity";

// emits on new datagram msg
export async function apnServiceGetResponseBuffer(msg: Buffer, info: AddressInfo): Promise<Buffer| undefined> {
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
    console.log("Decoded packet header:", packetHeader);
    // get device properties
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const d = await repostory.query().filter("address", nbiotComposedAddress).findOne();
    const key = Buffer.from(d!.nwkSKey, "hex");
    console.log("Device properties:", d);
    // verify cmac
    const cmac = msg.subarray(msg.length - 4);
    const cmacNumber = cmac.readInt32LE();
    const aesCmac = new AesCmac(key);
    const result = aesCmac.calculate(msg.subarray(0, msg.length - 4));
    const calculatedCmacNumber: number = result.subarray(0, 4).readInt32LE();
    const downlinkData = d?.downlinkData ? Buffer.from(d.downlinkData, "hex") : undefined;
    const timeZone = d?.timeZone ? d.timeZone : "Europe/Prague"; // default time zone

    if (calculatedCmacNumber == cmacNumber) {
        console.log("Cmac ok");
        const packetPayload = msg.subarray(17); // skip header at pos 17
        return processUplinkData(nbiotComposedAddress, timeZone, key, packetHeader, packetPayload, downlinkData);
    } else {
        console.log("Cmac verification failed");
    }
}

function processUplinkData(
    deviceAddress: string,
    timeZone: string,
    key: Buffer,
    packetHeader: UplinkPacketHeader,
    packetPayload: Buffer,
    downlinkData?: Buffer
): Buffer | undefined {
    if (packetHeader.packetType === 0) {
        const packet = uplinkPacket.decode(new Uint8Array(packetPayload), true);
        console.log("Decoded uplink packet type 0:\n", packet);
        saveMessage(deviceAddress, timeZone, packet);
        console.log("Measurement on", new Date(packet.measurementTimestamp * 1000));
        if (packet.flags.downlinkRequest || downlinkData) {
            return messageWithMac(createDownlinkMessage(packetHeader, downlinkData), key);
        }
    }
}

function saveMessage(deviceAddress: string, timeZone: string, packet: UplinkPacket) {
    saveMeasurementForDevice(deviceAddress, timeZone, createMeasurementFromPacket(packet));
}