import { createMeasurementFromPacket, createDateOfMeasurement } from "../src/service/measurement-service";
import { uplinkPacket } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";
import { DateTime, Duration, Interval } from "luxon";
import { Device } from "../src/model/device";

function kvak(a: number): number {
    a = 5;
    return a;
}

describe("other tests", () => {
    const rawHexaString = "163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78";
    
    test("a is changed", () => {
        const mockSvc = jest.fn();
        mockSvc();
        expect(mockSvc.mock.calls.length).toBe(1);
        // when
        // processEmail
        // then
        // emailTemplateService is called
        // then
    });

    test("create Measurement entity from uplink pack", () => {
        // given
        // when
        const up = uplinkPacket.decode(b(rawHexaString), true);
        // const nowUnixTimestamp = Math.trunc(Date.now() / 1000);
        // then
        console.log("uplinkMessage: ", up);
        const m = createMeasurementFromPacket(up, new Device(), "test");
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

    test("when asOf more than 1 day off from now then return now", () => {
        // given
        const now = new Date();
        const d1 = DateTime.fromJSDate(now).minus(Duration.fromObject({days:2}));
        const result = createDateOfMeasurement(d1.toJSDate(), now);
        expect(result).toBe(now);
    });

    test("when asOf less than 1 day off from now then return d1", () => {
        // given
        const now = new Date();
        const d1 = DateTime.fromJSDate(now).minus(Duration.fromObject({hours:12}));
        const result = createDateOfMeasurement(d1.toJSDate(), now);
        expect(result.getTime()).toBe(d1.toJSDate().getTime());
    });

    test("when forward shifted", () => {
        // given
        const now = new Date();
        const d1 = DateTime.fromJSDate(now).plus(Duration.fromObject({minutes:61}));
        const result = createDateOfMeasurement(d1.toJSDate(), now);
        expect(result.getTime()).toBe(now.getTime());
    });
});