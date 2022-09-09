import { Device } from "../model/device";
import { Connection, createConnection } from "ts-datastore-orm";
import { Measurement } from "../model/measurement.entity";
import { Year } from "../model/year.entity";
import { Month } from "../model/month.entity";
import { Day } from "../model/day.entity";
import { UplinkPacket } from "../utils/structbuffer";
import { ExtSensor } from "../model/ext-sensor.entity";
import luxon, { DateTime } from "luxon";

export async function saveMeasurementForDevice(connection: Connection, device: Device, measurement: Measurement) {
    const dateOfMeasurement = measurement.timestamp;
    const timeZone = device.timeZone ? device.timeZone : "Europe/Prague"; // default device timezone
    const zonedDateTime = DateTime.fromSeconds(dateOfMeasurement.getTime() / 1000).setZone(timeZone);

    const year = zonedDateTime.year; // dateOfMeasurement.getFullYear();
    const month = zonedDateTime.month - 1; // dateOfMeasurement.getMonth();
    const day = zonedDateTime.day; // dateOfMeasurement.getDate();

    const yearRepo = connection.getRepository(Year);
    const monthRepo = connection.getRepository(Month);
    const dayRepo = connection.getRepository(Day);
    const measurementRepo = connection.getRepository(Measurement);

    let y = await yearRepo.query().setAncestorKey(device!.getKey()).filter("year", year).findOne();
    if (y == undefined) {
        y = new Year();
        y.year = year;
        y._ancestorKey = device.getKey();
        y = await yearRepo.insert(y);
        console.log("Year created", y.getKey());
    }

    let m = await monthRepo.query().setAncestorKey(y!.getKey()).filter("month", month).findOne();
    if (m == undefined) {
        m = new Month();
        m.month = month;
        m._ancestorKey = y.getKey();
        m = await monthRepo.insert(m);
        console.log("Month created", m.getKey());
    }

    let d = await dayRepo.query().setAncestorKey(m!.getKey()).filter("day", day).findOne();
    if (d == undefined) {
        d = new Day();
        d.day = day;
        d._ancestorKey = m.getKey();
        d = await dayRepo.insert(d);
        console.log("Day created", d.getKey());
    }

    measurement._ancestorKey = d.getKey();
    measurement = await measurementRepo.insert(measurement);
    console.log("Measurement:");
    console.log(measurement);
    device.lastMeasurement = measurement;
    device.downlinkData = "";
    
    // update device
    const repostory = connection.getRepository(Device);
    await repostory.update(device);
    console.log("Measurement stored, device updated");
}

export function createMeasurementFromPacket(packet: UplinkPacket, device: Device): Measurement {
    let measurement = new Measurement();
    measurement.timestamp = new Date(packet.measurementTimestamp * 1000);
    if(device.address == "603a858bcf130300e22ff8bad2330300") {
        measurement.weight = ((packet.weight2 + packet.weight1 + packet.weight2 + packet.weight3) / 100) - device.zeroWeight;
        console.log("manualy adjusted faulty sensor")
    } else
        measurement.weight = ((packet.weight0 + packet.weight1 + packet.weight2 + packet.weight3) / 100) - device.zeroWeight;
    measurement.temperature = packet.temperature / 10;
    measurement.humidity = packet.humidity;
    measurement.pressure = packet.pressure;
    measurement.battery = packet.batterySoc.batteryLevel;
    measurement.batteryStatus = packet.batterySoc.status;
    measurement.alarm = packet.flags.alert == true ? true : false;
    measurement.cnt = packet.sequenceId;
    measurement.downlinkReq = packet.flags.downlinkRequest == true ? true : false;
    if (packet.extSensor.sensorFlags.sensorFound) {
        measurement.ext = new ExtSensor();
        measurement.ext!.temperature = packet.extSensor.temperature / 10;
        measurement.ext!.humidity = packet.extSensor.humidity;
        measurement.ext!.battery = packet.extSensor.batteryLevel;
        measurement.ext!.rssi = 0;
    }
    measurement.reset = packet.flags.restart == true ? true : false;
    measurement.rssi = packet.signalStrength;
    measurement.shutdown = packet.flags.shutdown == true ? true : false;
    return measurement;
}