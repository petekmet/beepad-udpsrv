import { downlinkPacketHeader, unixtime, uplinkPacket, uplinkPacketHeader } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";
import { createDownlinkMessage } from "../src/utils/message-utils";
import exp from "constants";

describe("message utils tests", () => {
    const rawHexaString = "163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78";
    const decodedHeader = uplinkPacketHeader.decode(b(rawHexaString), true);

    test("create downlink message with empty downlink data", () => {
        // given
        const downlinkData = Buffer.from("", "hex");
        console.log("uplink header: ", decodedHeader);
        // when
        const downlinkMessage = createDownlinkMessage(decodedHeader, downlinkData);
        const nowUnixTimestamp = Math.trunc(Date.now() / 1000);
        // then
        const downlinkMessageDecoded = downlinkPacketHeader.decode(new Uint8Array(downlinkMessage), true);
        console.log("downlinkMessage header: ", downlinkMessageDecoded);
        console.log(downlinkMessage.toString("hex"));
        expect(downlinkMessageDecoded.deviceId.toString()).toBe("866207050054422");
        expect(downlinkMessageDecoded.subscriberId.toString()).toBe("901405720014209");
        expect(downlinkMessageDecoded.packetType).toBe(0);
        expect(downlinkMessageDecoded.packetLength).toBe(4);
        expect(downlinkMessage.readUint8(16)).toBe(0);
        expect(downlinkMessage.readUint16LE(17)).toBe(4);
        expect(downlinkMessage.readUint32LE(19)).toBe(nowUnixTimestamp);
    });

    test("create downlink message with ext sensor address", () => {
        // given
        const downlinkData = Buffer.from("01FE0203040506", "hex");
        console.log("uplink header: ", decodedHeader);
        // when
        const downlinkMessage = createDownlinkMessage(decodedHeader, downlinkData);
        const nowUnixTimestamp = Math.trunc(Date.now() / 1000);
        // then
        const downlinkMessageDecoded = downlinkPacketHeader.decode(new Uint8Array(downlinkMessage), true);
        console.log("downlinkMessage header: ", downlinkMessageDecoded);
        console.log(downlinkMessage.toString("hex"));
        expect(downlinkMessageDecoded.deviceId.toString()).toBe("866207050054422");
        expect(downlinkMessageDecoded.subscriberId.toString()).toBe("901405720014209");
        expect(downlinkMessageDecoded.packetType).toBe(1);
        expect(downlinkMessageDecoded.packetLength).toBe(6);
        // check bytes
        expect(downlinkMessage.readUint8(16)).toBe(0x01); // packet type
        expect(downlinkMessage.readUint16LE(17)).toBe(6); // packet length
        expect(downlinkMessage.readUint8(19)).toBe(0xFE); // payload starts from here
        expect(downlinkMessage.readUint8(20)).toBe(0x02);
        expect(downlinkMessage.readUint8(21)).toBe(0x03);
        expect(downlinkMessage.readUint8(22)).toBe(0x04);
        expect(downlinkMessage.readUint8(23)).toBe(0x05);
        expect(downlinkMessage.readUint8(24)).toBe(0x06);
    });
});