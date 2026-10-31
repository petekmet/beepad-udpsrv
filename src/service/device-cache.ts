import { Device } from "../model/device";

// Device lookups by address for service uplinks (packetType 1: FW chunk
// requests and reports, a few seconds apart during a download). Those never
// write the Device back, so a short-lived copy is safe there; measurement
// uplinks save the whole entity (lastMeasurement, downlinkData) and always
// read it fresh, refreshing the cache on the way. A key change in admin-api is
// picked up after at most DEVICE_CACHE_TTL_MS.
export const DEVICE_CACHE_TTL_MS = 60_000;
const DEVICE_CACHE_MAX = 256;

const cache = new Map<string, { device: Device; at: number }>();

export function cachedDevice(address: string, now = Date.now()): Device | undefined {
    const hit = cache.get(address);
    if (!hit) return undefined;
    if (now - hit.at >= DEVICE_CACHE_TTL_MS) {
        cache.delete(address);
        return undefined;
    }
    return hit.device;
}

export function cacheDevice(device: Device, now = Date.now()) {
    cache.delete(device.address);
    cache.set(device.address, { device, at: now });
    if (cache.size > DEVICE_CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export function clearDeviceCache() {
    cache.clear();
}
