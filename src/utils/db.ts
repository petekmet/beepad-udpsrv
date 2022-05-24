import { Device } from "../model/device";
import { createConnection } from "ts-datastore-orm";

export async function initDb() {
    console.log("env.GOOGLE_SERVICE_ACCOUNT:", process.env.GOOGLE_SERVICE_ACCOUNT);
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const result = await repostory.query().limit(10).findMany();
    console.log(result);
}