import { createConnection, Repository } from "ts-datastore-orm";
import { Device } from "../src/model/device";
import { Measurement } from "../src/model/measurement.entity";
import { Year } from "../src/model/year.entity";
import { Month } from "../src/model/month.entity";
import { Day } from "../src/model/day.entity";
import { initDb } from "../src/utils/db";
import { moveMessagePortToContext } from "worker_threads";

describe("Datastore integration test suite", () => {

    test.skip("datastore t3", async () => {
        const nbiotComposedAddress = "163b858bcf130300606c8cded2330300";// "163b858bcf130300606c8cded2330300";
        await initDb();
        const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
        const repostory = connection.getRepository(Device);
        const device = await repostory.query().filter("address", nbiotComposedAddress).findOne();

        console.log("Device:", device);
        if (device) {
            const yearRepo = connection.getRepository(Year);
            const monthRepo = connection.getRepository(Month);
            const day = connection.getRepository(Day);
            const measurementRepo = connection.getRepository(Measurement);

            let y = await yearRepo.query().setAncestorKey(device!.getKey()).filter("year", 2022).findOne();
            if (y == undefined) {
                y = new Year();
                y.year = 2022;
                y._ancestorKey = device!.getKey();
                y = await yearRepo.insert(y);
                console.log("year created", y);
            } else {
                console.log("year:", y);
            }

            let m = await monthRepo.query().setAncestorKey(y!.getKey()).filter("month", 5).findOne();
            if (m == undefined) {
                m = new Month();
                m.month = 5;
                m._ancestorKey = y!.getKey();
                m = await monthRepo.insert(m);
                console.log("month created", m);
            }

            let d = await day.query().setAncestorKey(m!.getKey()).filter("day", 21).findOne();
            if (d == undefined) {
                d = new Day();
                d.day = 21;
                d._ancestorKey = m!.getKey();
                d = await day.insert(d);
                console.log("day created", d);
            }

            let measurement = new Measurement();
            measurement.weight = 1.0;
            measurement._ancestorKey = d!.getKey();
            measurement = await measurementRepo.insert(measurement);

            console.log("Measurement:");
            // const y = new Year();
            // y._ancestorKey = d?.getKey();
            console.log(measurement);
            device!.lastMeasurement = measurement;
            await repostory.update(device!);
        }
    });

    test.skip("read Measurement", async () => {
        await initDb();
        const connection = createConnection({ keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT! });
        const repostory = connection.getRepository(Measurement);
        const m = await repostory.query().limit(20).order("timestamp", { descending: true }).findMany();
        // console.log("Measurement:");
        // m.forEach(m => console.log(m._ancestorKey));
    });
});

