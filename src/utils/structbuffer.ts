import { bool, int16_t, int8_t, StructBuffer, uint16_t, uint32_t, uint64_t, uint8_t } from "struct-buffer";

export const batterySocPacket = new StructBuffer("batterysoc", {
    batteryLevel: uint16_t,
    status : uint8_t,
});
const extSensorPacket = new StructBuffer("extsensor", {
    deviceId: uint8_t[6],
    temperature: int16_t,
    humidity: uint8_t,
    batteryLevel: uint16_t,
    sensorFlags: uint8_t,
});
export const uplinkPacket = new StructBuffer("uplink", {
    subscriberId: uint64_t,
    packetType: uint8_t,
    sequenceId: uint8_t,
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
    alert: bool,
    restart: bool,
    shutdown: bool,
    downlinkRequest: bool,
    flags: uint8_t,
    cmcic: uint32_t,
});