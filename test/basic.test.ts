import { sbytes as b } from "struct-buffer";
import { uplinkPacket } from "../src/utils/structbuffer";

describe("some test", () => {
    test("empty string should result in zero", () => {
        expect(0).toBe(0);
    });
    const rawHexaString = "00000000000000000000000000000000003201000000050025da030000000000000000000000000000000000000000000000000804030201";
    const decoded = uplinkPacket.decode(b(rawHexaString), true);
    console.log("decoded> ", decoded);
    expect(decoded.sequenceId).toBe(50);
    expect(decoded.measurementTimestamp).toBe(1);
    expect(decoded.temperature).toBe(5);
    expect(decoded.cmic).toBe(0x01020304);
});


