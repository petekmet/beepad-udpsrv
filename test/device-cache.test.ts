import { Device } from "../src/model/device";
import { cacheDevice, cachedDevice, clearDeviceCache, DEVICE_CACHE_TTL_MS } from "../src/service/device-cache";

function device(address: string): Device {
    const d = new Device();
    d.address = address;
    return d;
}

describe("device cache", () => {
    beforeEach(() => clearDeviceCache());

    test("a cached device is served until the TTL runs out", () => {
        const d = device("aa");
        cacheDevice(d, 1000);
        expect(cachedDevice("aa", 1000 + DEVICE_CACHE_TTL_MS - 1)).toBe(d);
        expect(cachedDevice("aa", 1000 + DEVICE_CACHE_TTL_MS)).toBeUndefined();
        expect(cachedDevice("aa", 1000)).toBeUndefined(); // expired entries are dropped
    });

    test("a fresh read replaces the cached copy", () => {
        const old = device("aa");
        const fresh = device("aa");
        cacheDevice(old, 1000);
        cacheDevice(fresh, 2000);
        expect(cachedDevice("aa", 2000)).toBe(fresh);
    });

    test("unknown address is a miss", () => {
        expect(cachedDevice("bb")).toBeUndefined();
    });
});
