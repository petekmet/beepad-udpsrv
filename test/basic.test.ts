import { batterySocPacket } from "../src/utils/structbuffer";

describe("some test", () => {
    test("empty string should result in zero", () => {
        expect(0).toBe(0);
    });
    test("some bitfields are there", () => {
        const decoded = batterySocPacket.decode(new Uint8Array([0x01, 0x02, 0x03]));
        console.log("decoded> ",decoded);
        expect(decoded.batteryLevel).toBe(258);
    });
});
