import { Device } from "../model/device";
import { createConnection } from "ts-datastore-orm";
import { env } from "process";

export async function initDb() {
    if(!env.GOOGLE_SERVICE_ACCOUNT){
        env.GOOGLE_SERVICE_ACCOUNT = "./datastore-service-account.json";
    }
    console.log("env.GOOGLE_SERVICE_ACCOUNT:", process.env.GOOGLE_SERVICE_ACCOUNT);
    const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
    const repostory = connection.getRepository(Device);
    const result = await repostory.query().limit(10).findMany();
    console.log(result);
}