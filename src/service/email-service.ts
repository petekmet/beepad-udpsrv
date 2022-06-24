import { SendEmailCommand, SendEmailCommandInput, SESv2Client, SESv2ClientConfig } from "@aws-sdk/client-sesv2";
import { env } from "process";
import { Device } from "../model/device";
import { Measurement } from "../model/measurement.entity";

const sesV2Config: SESv2ClientConfig = {
    credentials: {
        secretAccessKey: env.AWS_SES_ACCESS_SECRET!,
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID!
    },
    region: "eu-west-1",
};

export function processEmailAlerts(device: Device, measurement: Measurement) {
    // check battery state
    // check battery state
    if(measurement.battery > 3700 && device.batteryLow == true) {
        device.batteryLow = false;
        // send battery back to normal email
        console.log("Battery back to normal");
    }else
    if(measurement.battery < 3400 && device.batteryLow == false) {
        device.batteryLow = true;
        // send battery low email
        console.log("Battery low");
    }

    // check weight state
    const deltaWeight = measurement.weight - device.lastMeasurement.weight;
    if(Math.abs(deltaWeight) > 1) {
        measurement.alarm = true;
        // send alarm email
        sendWeightAlertEmail(device, deltaWeight);
    }
}

async function sendWeightAlertEmail(device: Device, weightDelta: number) {
    const client = new SESv2Client(sesV2Config);
    const templateData = {
        devicename:device.name,
        deviceid: device._id,
        weight: weightDelta
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
    await client.send(command);
}