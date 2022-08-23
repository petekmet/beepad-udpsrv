import { env } from "process";

export async function initDb() {
    console.log("env.GOOGLE_APPLICATION_CREDENTIALS:", env.GOOGLE_APPLICATION_CREDENTIALS);
}

export async function initMongoose() {
    // await mongoose.connect(env.MONGO_DB_URI!, { dbName: env.MONGO_DB_NAME });
    // console.log("mongodb connected");
    // const NbiotDeviceModel = getModelForClass(NbiotDevice);
    //console.log("devices:", await NbiotDeviceModel.find().exec());  
}