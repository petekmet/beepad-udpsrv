import { Connection } from "ts-datastore-orm";
import { HealthTrailer } from "../fw/fw-protocol";
import { Device } from "../model/device";
import { DeviceHealth } from "../model/device-health.entity";
import logger, { evt } from "../utils/logger";

// RESET_CAUSE_* from the firmware's src/resetcause.h (beepad-scale-arduino)
const RESET_CAUSES: Record<number, string> = {
    0: "POWER_ON", 1: "UNEXPECTED", 2: "BLE_COMMAND", 3: "BLE_DFU", 4: "BLE_INSTALL",
    5: "NBIOT_INSTALL", 6: "SHUTDOWN", 7: "NTP_FAILED", 8: "SEND_FAILED", 9: "MUTEX",
    10: "DOWNLINK", 11: "FAULT", 12: "STACK_OVERFLOW", 13: "DL_URC", 14: "DL_HEX",
    15: "DL_CMAC", 16: "DL_CMAC_OK", 17: "DL_OTA_QUEUED", 18: "OTA_OFFER", 19: "OTA_SAVE_JOB",
    20: "OTA_REPORT", 21: "STALL",
};

// restarts that point at a problem worth following up
const PROBLEM_CAUSES = new Set([1, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);

export function resetCauseName(cause: number): string {
    return RESET_CAUSES[cause] ?? `UNKNOWN_${cause}`;
}

/** The scale needed help: it restarted for a bad reason or its modem had to recover. */
export function needsFollowUp(h: HealthTrailer): boolean {
    return PROBLEM_CAUSES.has(h.resetCause) || h.reattachAttempts > 0 || h.failedSends > 0;
}

export function healthChanged(prev: DeviceHealth | undefined, h: HealthTrailer): boolean {
    return !prev || prev.lastResetCause !== h.resetCause || prev.reattachAttempts !== h.reattachAttempts
        || prev.reattachRecovered !== h.reattachRecovered || prev.failedSends !== h.failedSends;
}

/** A packetType 3 uplink: log the health, store it when it changed. */
export async function onHealthReport(connection: Connection, device: Device, h: HealthTrailer, trace: string, now = new Date()): Promise<void> {
    const ctx = {
        trace, device: device.address, deviceName: device.name, deviceId: device._id,
        resetCause: resetCauseName(h.resetCause), reattachAttempts: h.reattachAttempts,
        reattachRecovered: h.reattachRecovered, failedSends: h.failedSends,
    };
    const repo = connection.getRepository(DeviceHealth);
    const prev = await repo.findOne(device._id);
    if (!healthChanged(prev, h)) return;
    const msg = "Health: last reset %s, re-attaches %d (%d recovered), failed sends %d";
    const args = [resetCauseName(h.resetCause), h.reattachAttempts, h.reattachRecovered, h.failedSends];
    if (needsFollowUp(h)) logger.warn("WARNING: " + msg, ...args, evt("health", ctx));
    else logger.info(msg, ...args, evt("health", ctx));
    const dh = prev ?? Object.assign(new DeviceHealth(), { _id: device._id });
    dh.lastResetCause = h.resetCause;
    dh.lastResetCauseName = resetCauseName(h.resetCause);
    dh.reattachAttempts = h.reattachAttempts;
    dh.reattachRecovered = h.reattachRecovered;
    dh.failedSends = h.failedSends;
    dh.reportedAt = now;
    await repo.upsert(dh);
}
