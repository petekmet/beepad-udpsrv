import { Device } from "../model/device";
import { Connection } from "ts-datastore-orm";
import { Measurement } from "../model/measurement.entity";
import { Year } from "../model/year.entity";
import { Month } from "../model/month.entity";
import { Day } from "../model/day.entity";
import { UplinkPacket } from "../utils/structbuffer";
import { ExtSensor } from "../model/ext-sensor.entity";
import { DateTime, Interval } from "luxon";

export async function saveMeasurementForDevice(connection: Connection, device: Device, measurement: Measurement, downlinRequested: boolean) {
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
    device.lastMeasurement = measurement;
    if(downlinRequested){
        device.downlinkData = "";
    }

    // update device
    const deviceRepostory = connection.getRepository(Device);
    await deviceRepostory.update(device);
    console.log("Measurement", measurement._id, "stored, device", device._id, "updated");
}

export function createMeasurementFromPacket(packet: UplinkPacket, device: Device): Measurement {
    const asOf = new Date(packet.measurementTimestamp * 1000);
    // if class < 3 -> check delta (dateOf, dateOn) > 8 hours -> use dateOf = dateOn else dateOf = dateOf
    const dateOfMeasurement = device.deviceClass > 2 ? asOf : createDateOfMeasurement(asOf, new Date());
    const measurement = new Measurement();
    measurement.asOn = new Date();
    measurement.timestamp = dateOfMeasurement;
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

export function createDateOfMeasurement(timestamp: Date, timestampNow: Date): Date {
    const delta = Interval.fromDateTimes(DateTime.fromJSDate(timestamp), DateTime.fromJSDate(timestampNow));
    const spread = delta.toDuration('days').days;
    if (spread >= 1) { 
        console.log("WARNING: Fixing asOf to now. Excess clock lag in days:", spread); 
    }else
    if(delta.toDuration('hours').hours < -1) {
        console.log("WARNING: Excess clock forward in days:", spread);
    }
    return spread >= 1 ? timestampNow : timestamp;
}