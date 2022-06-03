
import { AesCmac } from "aes-cmac";
import { sbytes as b } from "struct-buffer";
import { initDb } from "../src/utils/db";
import { downlinkPacketHeader, unixtime, uplinkPacket, uplinkPacketHeader } from "../src/utils/structbuffer";

describe("some test", () => {
    test("encoding", () => {
        const encoded = downlinkPacketHeader.encode({
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

    test("decoding", () => { //000313CF8B853B16
        const rawHexaString = "000313cf8b853b16000333d2dfbd6d810000c0169962c60027e1039b0000000000000000ee1001000000000000000000000000086c554e5a";
        const msg = Buffer.from(rawHexaString, "hex");
        const decoded = uplinkPacket.decode(new Uint8Array(msg.subarray(17)), true);
        const extSens = decoded.extSensor;
        console.log("raw: ", msg.subarray(17).toString("hex"));
        console.log("measurement timestamp ", new Date(decoded.measurementTimestamp*1000));
        console.log("decoded> ", decoded);
        expect(decoded.sequenceId).toBe(0x00);
        expect(decoded.measurementTimestamp).toBe(1654200000);
        expect(decoded.temperature).toBe(198);
        expect(decoded.cmic).toBe(1515083116);
    });

    test("decodeUplinkHeader", () => {
        const rawHexaString = "163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78";
        const decodedHeader = uplinkPacketHeader.decode(b(rawHexaString), true);
        expect(decodedHeader.deviceId.toString()).toBe("866207050054422");
        expect(decodedHeader.subscriberId.toString()).toBe("901405720014209");
        expect(decodedHeader.packetType).toBe(0);
    });

    // test("datastore", async ()=> {
    //     await initDb();
    // });

    test("aes-cmac", () => {
        const key = Buffer.from("046323FE0156003BD3034C1001E0AC67", "hex");
        const message = Buffer.from("997417ACDEADBEEF", "hex");
        const cmac = Buffer.from("F723330980D0C3895BBB360D2D036926", "hex");
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(message);
        expect(result.toString("hex")).toBe(cmac.toString("hex"));
    });

    test("aes-cmac-from-device", ()=>{
        const key = Buffer.from("CB4E3EA400309DAB656D8DBFE4B93F35", "hex");
        const message = Buffer.from("0000000000000000ffffff7f00000000000030b79762d50024da039b0000000000000000011101000000000000000000000000082cc95bb0", "hex");
        const cmac = message.subarray(message.length-4); // Buffer.from("2cc95bb0", "hex");
        console.log("cmac:", cmac.toString("hex"));
        const cmacNumber = cmac.readInt32LE();
        console.log("cmacNumber:", cmacNumber);
        const aesCmac = new AesCmac(key);
        const result = aesCmac.calculate(message.subarray(0,message.length-4));
        const calculatedCmacNumber: number = result.subarray(0,4).readInt32LE();
        expect(calculatedCmacNumber).toBe(cmacNumber);
    });
});
