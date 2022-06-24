import { createMeasurementFromPacket } from "../src/service/measurement-service";
import { uplinkPacket } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";
import { DateTime } from "luxon";
import nodemailer from "nodemailer";

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

    test.skip("nodemailer", async () => {
        const transporter = await nodemailer.createTransport({
            host: "email-smtp.eu-west-1.amazonaws.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: "AKIAST575VNQ2CZI6D3R",
                pass: "BEarGSbdvRXxHR4Rwbg8oe2BJ9q8wRYuH1VD33kAPHRp",
            },
            logger: true
        });

        // send mail with defined transport object
        const info = await transporter.sendMail({
            from: '"Upozornenie BeePad" <info@mybeepad.com>',
            to: "peter.kmet@t16.biz",
            subject: "Hello from node",
            text: "Hello world?",
            html: "<strong>Hello world?</strong>",
            headers: { 'x-myheader': 'test header' }
        });

        console.log("Message sent: %s", info.response);
    });
});