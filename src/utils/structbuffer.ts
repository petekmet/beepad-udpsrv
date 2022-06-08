import { bitFields, int16_t, int8_t, StructBuffer, uint16_t, uint32_t, uint64_t, uint8_t } from "struct-buffer";

interface TimeStamp {
    timestamp: number
}

interface BatterySoc {
    batteryLevel: number,
    status: number
}

interface ExtSensor {
    deviceId: number[],
    temperature: number,
    humidity: number,
    batteryLevel: number,
    sensorStatus: number
}

interface UplinkFlags {
    alert: boolean,
    restart: boolean,
    shutdown: boolean,
    downlinkRequest: boolean,
    lastDownlinkSuccess: boolean,
    reserved: number
}

interface UplinkPacket {
    sequenceId: number,
    measurementTimestamp: number,
    temperature: number,
    humidity: number,
    pressure: number,
    signalStrength: number,
    weight0: number,
    weight1: number,
    weight2: number,
    weight3: number,
    batterySoc: BatterySoc,
    extSensor: ExtSensor,
    flags: UplinkFlags,
    cmic: number
}

interface UplinkPacketHeader {
    deviceId: BigInt,
    subscriberId: BigInt,
    packetType: number
}

export const batterySocPacket = new StructBuffer<BatterySoc>("batterysoc", {
    batteryLevel: uint16_t,
    status: uint8_t,
});

export const extSensorBitFlags = bitFields(uint8_t, {
    sensorFound: 1,
    reserved: 7
});

const extSensorPacket = new StructBuffer<ExtSensor>("extsensor", {
    deviceId: uint8_t[6],
    temperature: int16_t,
    humidity: uint8_t,
    batteryLevel: uint16_t,
    sensorFlags: extSensorBitFlags
});

export const uplinkFlags = bitFields(uint8_t, {
    alert: 1,
    restart: 1,
    shutdown: 1,
    downlinkRequest: 1,
    lastDownlinkSuccess: 1,
    reserved: 3
});

export const uplinkPacket = new StructBuffer<UplinkPacket>("uplink", {
    sequenceId: uint8_t,
    measurementTimestamp: uint32_t,
    temperature: int16_t,
    humidity: uint8_t,
    pressure: uint16_t,
    signalStrength: int8_t,
    weight0: int16_t,
    weight1: int16_t,
    weight2: int16_t,
    weight3: int16_t,
    batterySoc: batterySocPacket,
    extSensor: extSensorPacket,
    flags: uplinkFlags,
    cmic: uint32_t,
});

export const downlinkSetSensorPacket = new StructBuffer("downlinksetsensor", {
    deviceId: uint8_t[6]
});

export const bitFlags = bitFields(uint8_t, {
    shutdown: 1,
    downlinkRequest: 2,
    alert: 3,
    restart: 4,
    reserved1: 5,
    reserved2: 6,
    reserved3: 7,
    reserved4: 8
});

export const uplinkPacketHeader = new StructBuffer<UplinkPacketHeader>("uplinkHeader", {
    deviceId: uint64_t,
    subscriberId: uint64_t,
    packetType: uint8_t
});

export const downlinkPacketHeader = new StructBuffer("downlinkHeader", {
    deviceId: uint64_t,
    subscriberId: uint64_t,
    packetType: uint8_t,
    packetLength: uint16_t
});

export const unixtime = new StructBuffer<TimeStamp>("timestamp", {
    timestamp: uint32_t
});