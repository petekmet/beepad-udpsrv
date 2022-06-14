// Keeps UDP port open for incoming messages
import { AesCmac } from "aes-cmac";
import { AddressInfo } from "net";
import { Device } from "../model/device";
import { createConnection } from "ts-datastore-orm";
import { downlinkPacketHeader, unixtime, UplinkPacket, uplinkPacket, UplinkPacketHeader, uplinkPacketHeader } from "../utils/structbuffer";

// sends response messages to the device

// const key = Buffer.from("CB4E3EA400309DAB656D8DBFE4B93F35", "hex");

// emits on new datagram msg
export async function apnServiceGetResponseBuffer(msg: Buffer, info: AddressInfo): Promise<Buffer> {
    // verify cmac
    // extract device address
    // extract packet type
    // extract cmac
    // calculate cmac
    // decode header
    // const packet = uplinkPacket.decode(msg, true);
    const packetHeader: UplinkPacketHeader = uplinkPacketHeader.decode(msg, true);
    const nbiotComposedAddress: string = msg.subarray(0,16).toString("hex");
    console.log("NB-IoT device composed address:", nbiotComposedAddress);
    console.log("Decoded packet header:", packetHeader);
    // get device properties
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const d = await repostory.query().filter("address", nbiotComposedAddress).findOne();
    const key = Buffer.from(d!.nwkSKey, "hex");
    console.log("Device properties:", d);
    // verify cmac
    const cmac = msg.subarray(msg.length-4); // Buffer.from("2cc95bb0", "hex");
    const cmacNumber = cmac.readInt32LE();
    const aesCmac = new AesCmac(key);
    const result = aesCmac.calculate(msg.subarray(0,msg.length-4));
    const calculatedCmacNumber: number = result.subarray(0,4).readInt32LE();

    if(calculatedCmacNumber == cmacNumber) {
        console.log("Cmac ok");
        const packetPayload = msg.subarray(17); // skip header at pos 17
        return processUplinkData(key, packetHeader, packetPayload);
    }else{
        console.log("Cmac verification failed");
    }
    return Buffer.from("");
}

function processUplinkData(key: Buffer, packetHeader: UplinkPacketHeader, packetPayload: Buffer): Buffer{
    if(packetHeader.packetType === 0){
        const packet = uplinkPacket.decode(new Uint8Array(packetPayload), true);
        console.log("Decoded uplink packet type 0:\n", packet);
        saveMessage(packet);
        if (packet.flags.downlinkRequest) {
            // create downlink message, return unix timestamp if no message in DB
            // set packet type based on message first byte
            const header = downlinkPacketHeader.encode({
                deviceId: packetHeader.deviceId,
                subscriberId: packetHeader.subscriberId,
                packetType: 0,
                packetLength: 4,
            }, true);
            const payload = unixtime.encode({ timestamp: Math.trunc(Date.now() / 1000) });
            const message = Buffer.concat([Buffer.from(header.buffer), Buffer.from(payload.buffer)]);
            return messageWithMac(message, key);
    
        } else {
            console.log("No downlink requested");
        }
    }
    return Buffer.from("");
}

function messageWithMac(message: Buffer, key: Buffer): Buffer{
    const aesCmac = new AesCmac(key);
    const cmac = aesCmac.calculate(message);
    return Buffer.concat([message, cmac.subarray(0,4)]);
}

function saveMessage(packet: UplinkPacket){
    console.log("Measurement on", new Date(packet.measurementTimestamp*1000));
    console.log("Storing message...");
}