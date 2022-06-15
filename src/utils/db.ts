import { getModelForClass } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { env } from "process";
import { NbiotDevice } from "../model/nbiot-device";

export async function initDb() {
    if(!env.GOOGLE_SERVICE_ACCOUNT){
        env.GOOGLE_SERVICE_ACCOUNT = "./datastore-service-account.json";
    }
    console.log("env.GOOGLE_SERVICE_ACCOUNT:", process.env.GOOGLE_SERVICE_ACCOUNT);
}

export async function initMongoose() {
    console.log("initMongoose:", process.env.MONGO_DB_URI);
    await mongoose.connect(env.MONGO_DB_URI!, { dbName: env.MONGO_DB_NAME });
    console.log("mongodb connected");
    // const NbiotDeviceModel = getModelForClass(NbiotDevice);
    //console.log("devices:", await NbiotDeviceModel.find().exec());  
}