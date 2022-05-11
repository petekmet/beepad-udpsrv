import { sbytes as b } from "struct-buffer";
import { batterySocPacket, uplinkPacket } from "../src/utils/structbuffer";

describe("some test", () => {
    test("empty string should result in zero", () => {
        expect(0).toBe(0);
    });
    test("some bitfields are there", () => {
        const rawHexaString = "000000000000000000000000000000000032050025da03000000000000000000000000000000000000000000000000 08 04030201";
        const decoded = uplinkPacket.decode(b(rawHexaString), true);
        console.log("decoded> ", decoded);
        expect(decoded.sequenceId).toBe(50);
        expect(decoded.temperature).toBe(5);
        expect(decoded.cmic).toBe(0x01020304);
    });
});


