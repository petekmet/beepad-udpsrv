import axios from "axios";
import { Connection } from "ts-datastore-orm";
import { env } from "process";
import { Device } from "../model/device";
import { Measurement } from "../model/measurement.entity";
import { Settings } from "../model/settings.entity";
import logger, { evt } from "../utils/logger";

/**
 * Evaluate battery-hysteresis and weight-alarm rules for a freshly received
 * measurement. Thresholds + toggles come from the shared "global" Settings
 * entity (configured in beepad-admin-ui). Mutates `device.batteryLow` /
 * `measurement.alarm` (persisted by the caller) and — only on a transition/alarm
 * — calls the typed beepad-admin-api notification endpoint with raw values;
 * admin-api owns template selection, currency and formatting.
 *
 * Must be awaited before the device/measurement are persisted so the flag
 * mutations are saved.
 */
// Per-process TTL cache of the single "global" Settings entity, to avoid a
// Datastore read on every measurement. Config changes propagate within the TTL.
const SETTINGS_CACHE_TTL_MS = Number(env.SETTINGS_CACHE_TTL_MS ?? 300000);
let cachedSettings: Settings | undefined;
let cachedSettingsAt = 0;

async function getCachedSettings(connection: Connection): Promise<Settings | undefined> {
    const now = Date.now();
    if (now - cachedSettingsAt < SETTINGS_CACHE_TTL_MS) {
        return cachedSettings;
    }
    cachedSettings = await connection.getRepository(Settings).findOne("global");
    cachedSettingsAt = now;
    return cachedSettings;
}

export async function processEmailAlerts(connection: Connection, device: Device, measurement: Measurement, trace: string) {
    const settings = await getCachedSettings(connection);
    const ctx = { trace, device: device.address, deviceName: device.name, deviceId: device._id };

    // battery state (hysteresis) — entirely gated by the enable toggle. Ignore a
    // 0 reading (means "no battery data").
    if (settings?.batteryNotificationEnabled && measurement.battery > 0) {
        if (measurement.battery > settings.batteryRestoreThresholdMv && device.batteryLow == true) {
            device.batteryLow = false;
            logger.info("Battery back to normal on device %s", device.address, evt("notification", ctx));
            postNotify("/internal/notify/battery", { deviceId: device._id, state: "OK", batteryMv: measurement.battery, weight: measurement.weight }, ctx);
        } else if (measurement.battery < settings.batteryLowThresholdMv && device.batteryLow == false) {
            device.batteryLow = true;
            logger.info("Battery low on device %s", device.address, evt("notification", ctx));
            postNotify("/internal/notify/battery", { deviceId: device._id, state: "LOW", batteryMv: measurement.battery, weight: measurement.weight }, ctx);
        }
    }

    // weight state (jump between consecutive measurements). The alarm flag always
    // tracks the configured threshold (default 1.0 kg); the email is gated by the
    // enable toggle.
    if (device.lastMeasurement) {
        const threshold = settings?.weightAlarmThresholdKg ?? 1;
        const deltaWeight = measurement.weight - device.lastMeasurement.weight;
        if (Math.abs(deltaWeight) > threshold) {
            measurement.alarm = true;
            logger.info(
                "Device %s weight alarm: previous %s now %s delta %s",
                device.address, device.lastMeasurement.weight, measurement.weight, deltaWeight,
                evt("notification", ctx),
            );
            if (settings?.weightAlarmEnabled) {
                postNotify("/internal/notify/weight-alarm", { deviceId: device._id, deltaWeight }, ctx);
            }
        }
    }
}

/**
 * Fire-and-forget call to a typed admin-api notification endpoint. admin-api
 * resolves the owner's address + billing currency, picks the template and sends.
 */
async function postNotify(path: string, body: Record<string, unknown>, ctx: { trace: string; device: string; deviceName?: string; deviceId?: number }) {
    const url = env.ADMIN_API_INTERNAL_URL;
    const token = env.INTERNAL_API_TOKEN;
    if (!url || !token) {
        logger.warn("ADMIN_API_INTERNAL_URL / INTERNAL_API_TOKEN not configured; skipping notification for device %s", body.deviceId, evt("notification", { ...ctx, path }));
        return;
    }
    try {
        await axios.post(`${url}${path}`, body, { headers: { "X-Internal-Token": token }, timeout: 5000 });
        logger.info("Requested notification %s for device %s", path, body.deviceId, evt("notification", { ...ctx, path }));
    } catch (e) {
        logger.error("Failed calling notification endpoint %s for device %s: %s", path, body.deviceId, e, evt("notification", { ...ctx, path }));
    }
}
