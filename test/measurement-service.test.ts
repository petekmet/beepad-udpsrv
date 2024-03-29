import { createMeasurementFromPacket, createDateOfMeasurement } from "../src/service/measurement-service";
import { uplinkPacket } from "../src/utils/structbuffer";
import { sbytes as b } from "struct-buffer";
import { DateTime, Duration, Interval } from "luxon";
import nodemailer from "nodemailer";
import { SendEmailCommand, SendEmailCommandInput, SESv2Client, SESv2ClientConfig } from "@aws-sdk/client-sesv2";
import { env } from "process";
import { Device } from "../src/model/device";

const sesV2Config: SESv2ClientConfig = {
    credentials: {
        secretAccessKey: env.AWS_SES_ACCESS_SECRET!,
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID!
    },
    region: "eu-west-1",
};
const client = new SESv2Client(sesV2Config);

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
        const m = createMeasurementFromPacket(up, new Device());
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

    test.skip("nodemailer", async () => {
        const transporter = await nodemailer.createTransport({
            host: "email-smtp.eu-west-1.amazonaws.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: "AKIAST575VNQ2CZI6D3R", // deleted
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

    test.skip("send email aws ses api", async () => {
        const templateData = {
            devicename: "TEST1"
        };
        const params: SendEmailCommandInput = {
            Content: {
                Template:{
                    TemplateName: "SK_BatteryLowTemplate",
                    TemplateData: JSON.stringify(templateData)
                }
            },
            Destination: {
                ToAddresses: ["peter.kmet@t16.biz"]
            },
            FromEmailAddress: "BeePad <info@mybeepad.com>",
        }
        const command = new SendEmailCommand(params);
        await client.send(command);
    });

    test.skip("send eamil weight alert", async () => {
        const templateData = {
            "devicename": "TEST1",
            "deviceid": "6401590107832320",
            "weight": "5.0",
        };
        const params: SendEmailCommandInput = {
            Content: {
                Template:{
                    TemplateName: "SK_WeightAlertTemplate",
                    TemplateData: JSON.stringify(templateData)
                }
            },
            Destination: {
                ToAddresses: ["peter.kmet@t16.biz"]
            },
            FromEmailAddress: "BeePad <info@mybeepad.com>",
        }
        const command = new SendEmailCommand(params);
        console.log(client);
        await client.send(command);
    });
});