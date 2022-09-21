import { AccountDetails, SendEmailCommand, SendEmailCommandInput, SESv2Client, SESv2ClientConfig } from "@aws-sdk/client-sesv2";
import { Connection, createConnection } from "ts-datastore-orm";
import { env } from "process";
import { Device } from "../model/device";
import { Measurement } from "../model/measurement.entity";
import { Site } from "../model/site.entity";
import { Account } from "../model/account.entity";

const sesV2Config: SESv2ClientConfig = {
    credentials: {
        secretAccessKey: env.AWS_SES_ACCESS_SECRET!,
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID!
    },
    region: "eu-west-1",
};

export function processEmailAlerts(connection: Connection, device: Device, measurement: Measurement) {
    // check battery state
    if (measurement.battery > 3700 && device.batteryLow == true) {
        device.batteryLow = false;
        // send battery back to normal email
        console.log("Battery back to normal");
    } else
        if (measurement.battery < 3400 && device.batteryLow == false) {
            device.batteryLow = true;
            // send battery low email
            console.log("Battery low");
        }

    // check weight state
    if (device.lastMeasurement) {
        const deltaWeight = measurement.weight - device.lastMeasurement.weight;
        if (Math.abs(deltaWeight) > 1) {
            measurement.alarm = true;
            // send alarm email
            sendWeightAlertEmail(connection, device, deltaWeight);
        }
    }
}

async function getAccountBySite(connection: Connection, s: Site): Promise<Account | undefined> {
    return await connection.getRepository(Account).findOne(s!._ancestorKey!);
}

async function getEmailAddressByDevice(connection: Connection, device: Device): Promise<string[]> {
    // get sites with device
    const siteList = await connection.getRepository(Site).query().filter("devices", x => x.eq(device!.getKey())).findMany();
    // get accounts/emails with sites
    const accList = await Promise.all(siteList.map( async(site) => await getAccountBySite(connection, site)));
    return accList.map(account => account?.email ?? []).flat(1);
}

async function sendWeightAlertEmail(connection: Connection, device: Device, weightDelta: number) {
    const destination = await getEmailAddressByDevice(connection, device);
    console.log("Emails to be notified:", destination);
    const client = new SESv2Client(sesV2Config);
    const templateData = {
        devicename: device.name,
        deviceid: device._id,
        weight: weightDelta.toFixed(1)
    };
    const params: SendEmailCommandInput = {
        Content: {
            Template: {
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