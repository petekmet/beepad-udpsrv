
import { sbytes as b } from "struct-buffer";
import { createConnection } from "ts-datastore-orm";
import { downlinkPacket, unixtime, uplinkPacket } from "../src/utils/structbuffer";
import { initDb } from "../src/utils/db";
import { env } from "process";
import { AesCmac } from "aes-cmac";

describe("some test", () => {
    test("encoding", () => {
        const encoded = downlinkPacket.encode({
            deviceId: 0x123456789abcdef0,
            subscriberId: 0x123456789abcdef0,
            packetType: 0,
            packetLength: 4,
        });
        const dateNow = Math.trunc(Date.now() / 1000);
        console.log("date now:", dateNow.toString(16));
        const d = unixtime.encode({ timestamp: dateNow });
        console.log("encoded:", encoded.buffer);
        const concated = Buffer.concat([Buffer.from(encoded.buffer), Buffer.from(d.buffer)]);
        console.log("concatenated buffer: ", concated.toString("hex"));
        expect(concated.toString("hex")).toBe("123456789abcdf00123456789abcdf00000004" + dateNow.toString(16));
    });

    test("decoding", () => {
        const rawHexaString = "00000000000000000000000000000000003201000000050025da030000000000000000000000000000000000000000000000000804030201";
        const decoded = uplinkPacket.decode(b(rawHexaString), true);
        const extSens = decoded.extSensor;
        console.log("decoded> ", decoded);
        expect(decoded.sequenceId).toBe(50);
        expect(decoded.measurementTimestamp).toBe(1);
        expect(decoded.temperature).toBe(5);
        expect(decoded.cmic).toBe(0x01020304);
        createConnection
    });

    test("datastore", async ()=> {
        await initDb();
    });

    test("aes-cmac", () => {
        const key = Buffer.from("046323FE0156003BD3034C1001E0AC67", "hex");
        const message = Buffer.from("997417ACDEADBEEF", "hex");
        const cmac = Buffer.from("F723330980D0C3895BBB360D2D036926", "hex");
        
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(message);
        expect(result.toString("hex")).toBe(cmac.toString("hex"));
    });
});
