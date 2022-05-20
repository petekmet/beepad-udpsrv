import { sbytes as b } from "struct-buffer";
import { downlinkPacket, unixtime, uplinkPacket } from "../src/utils/structbuffer";

describe("some test", () => {
    test("encoding", () => {
        const encoded = downlinkPacket.encode({
            deviceId: 0x123456789abcdef0,
            subscriberId: 0x123456789abcdef0,
            packetType: 0,
            packetLength: 4,
        });
        const dateNow = Math.trunc(Date.now()/1000);
        console.log("date now:", dateNow.toString(16));
        const d = unixtime.encode({ timestamp: dateNow });
        console.log("encoded:", encoded.buffer);
        const concated = Buffer.concat([Buffer.from(encoded.buffer), Buffer.from(d.buffer)]);
        console.log("concatenated buffer: ", concated.toString("hex"));
        expect(concated.toString("hex")).toBe("123456789abcdf00123456789abcdf00000004"+dateNow.toString(16));
    });

    test("decoding", () => {
        const rawHexaString = "00000000000000000000000000000000003201000000050025da030000000000000000000000000000000000000000000000000804030201";
        const decoded = uplinkPacket.decode(b(rawHexaString), true);
        console.log("decoded> ", decoded);
        expect(decoded.sequenceId).toBe(50);
        expect(decoded.measurementTimestamp).toBe(1);
        expect(decoded.temperature).toBe(5);
        expect(decoded.cmic).toBe(0x01020304);
    });
});


