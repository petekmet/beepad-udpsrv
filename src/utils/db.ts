import { env } from "process";

export async function initDb() {
}

export async function initMongoose() {
    // await mongoose.connect(env.MONGO_DB_URI!, { dbName: env.MONGO_DB_NAME });
    // console.log("mongodb connected");
    // const NbiotDeviceModel = getModelForClass(NbiotDevice);
    //console.log("devices:", await NbiotDeviceModel.find().exec());  
}