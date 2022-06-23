import { createMeasurementFromPacket } from "../src/service/measurement-service";
import { uplinkPacket } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";
import { DateTime } from "luxon";

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

    test("luxon api", () => {
        const timestamp = DateTime.fromSeconds(1655965800); // UTC 6 hour, Europe/Prague 8 hours
        const localTimestamp = timestamp.setZone("Europe/Prague");
        console.log("localTimestamp: ", localTimestamp);
        expect(localTimestamp.hour).toBe(8);
        expect(localTimestamp.minute).toBe(30);
        expect(localTimestamp.day).toBe(23);
        expect(localTimestamp.month).toBe(6);
        expect(localTimestamp.year).toBe(2022);
    });
});