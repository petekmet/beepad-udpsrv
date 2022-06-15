import { AesCmac } from "aes-cmac";
import { downlinkPacketHeader, unixtime, UplinkPacketHeader } from "./structbuffer";

export function createDownlinkMessage(packetHeader: UplinkPacketHeader, downlinkData?: Buffer): Buffer {
    // create downlink message, return unix timestamp if no message in DB
    // set packet type based on message first byte
    let packetType = 0; // default
    let packetLength = 4; // timestamp data size
    let payload: ArrayBuffer = unixtime.encode({ timestamp: Math.trunc(Date.now() / 1000) }).buffer;
    if(downlinkData && downlinkData.length > 0) {
        packetType = downlinkData.readUint8(0);
        packetLength = downlinkData.length - 1;
        payload = downlinkData.subarray(1);
    }
    const header = downlinkPacketHeader.encode({
        deviceId: packetHeader.deviceId,
        subscriberId: packetHeader.subscriberId,
        packetType: packetType,
        packetLength: packetLength,
    }, true);
    console.log("Downlink payload:", payload);
    return Buffer.concat([Buffer.from(header.buffer), Buffer.from(payload)]);
}

export function messageWithMac(message: Buffer, key: Buffer): Buffer {
    const aesCmac = new AesCmac(key);
    const cmac = aesCmac.calculate(message);
    return Buffer.concat([message, cmac.subarray(0, 4)]);
}