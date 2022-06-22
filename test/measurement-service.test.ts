import { createMeasurementFromPacket } from "../src/service/measurement-service";
import { uplinkPacket } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";

describe("message utils tests", () => {
    const rawHexaString = "163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78";

    test("create Measurement entity from uplink pack", () => {
        // given
        // when
        const up = uplinkPacket.decode(b(rawHexaString), true);
        // const nowUnixTimestamp = Math.trunc(Date.now() / 1000);
        // then
        console.log("uplinkMessage: ", up);
        const m = createMeasurementFromPacket(up);
        console.log("measurement: ", m);
        expect(m.shutdown).toBe(false);
        expect(m.reset).toBe(false);
        expect(m.alarm).toBe(false);
    });
});