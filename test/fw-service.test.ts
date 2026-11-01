import { Device } from "../src/model/device";
import { healthChanged, needsFollowUp, resetCauseName } from "../src/service/health-service";
import { DeviceHealth } from "../src/model/device-health.entity";
import { DeviceFirmware } from "../src/model/device-firmware.entity";
import { FirmwareImage } from "../src/model/firmware-image.entity";
import { ACTIVE_JOB_STATES, FwJobState, FwUpdateJob } from "../src/model/fw-update-job.entity";
import {
    decodeServiceUplink, DOWNLINK_FW_ABORT, DOWNLINK_FW_ACK, DOWNLINK_FW_CHUNK, DOWNLINK_FW_OFFER,
    encodeOffer, FW_CHUNK_REQ, FW_REPORT, FwAbortReason, FwStatus, FwVersionTrailer, splitMeasurementFw,
    versionCode,
} from "../src/fw/fw-protocol";
import { offerFor, onServiceUplink, onVersionReport, resetFwCachesForTest } from "../src/fw/fw-service";
import { FwStore } from "../src/fw/fw-store";
import { uplinkPacket } from "../src/utils/structbuffer";
import logger from "../src/utils/logger";

// --- in-memory store ---

class MemoryStore implements FwStore {
    jobs: FwUpdateJob[] = [];
    images = new Map<string, FirmwareImage>();
    firmware = new Map<number, DeviceFirmware>();
    jobWrites = 0;
    firmwareWrites = 0;

    async findJob(deviceId: number, jobSeq: number) {
        return this.copy(this.jobs.find(j => j.deviceId === deviceId && j.jobSeq === jobSeq));
    }
    async findActiveJob(deviceId: number) {
        return this.copy(this.jobs.find(j => j.deviceId === deviceId && ACTIVE_JOB_STATES.includes(j.state)));
    }
    async updateJob(job: FwUpdateJob, expectedState: FwJobState) {
        const i = this.jobs.findIndex(j => j._id === job._id);
        if (i < 0 || this.jobs[i].state !== expectedState) return false;
        this.jobs[i] = this.copy(job)!;
        this.jobWrites++;
        return true;
    }
    async findImage(id: string) { return this.images.get(id); }
    async findDeviceFirmware(deviceId: number) { return this.firmware.get(deviceId); }
    async saveDeviceFirmware(df: DeviceFirmware) { this.firmware.set(df._id, df); this.firmwareWrites++; }

    // the Datastore store hands out fresh objects on every read
    private copy(job?: FwUpdateJob): FwUpdateJob | undefined {
        return job ? Object.assign(new FwUpdateJob(), job) : undefined;
    }
    stored(id = 1) { return this.jobs.find(j => j._id === id)!; }
}

// --- fixtures ---

const NOW = new Date("2026-11-01T10:00:00Z");
const DEVICE_ID = 6401590107832320;

function device(deviceClass = 2): Device {
    const d = new Device();
    d._id = DEVICE_ID;
    d.address = "163b858bcf130300606c8cded2330300";
    d.name = "NB001-SK-TEST1";
    d.deviceClass = deviceClass;
    return d;
}

function image(size = 1000): FirmwareImage {
    const img = new FirmwareImage();
    img._id = "img-1";
    img.version = "1.8.9";
    img.buildNumber = 140;
    img.size = size;
    img.binary = Buffer.from(Array.from({ length: size }, (_, i) => (i * 7) & 0xff));
    img.initPacket = Buffer.alloc(116, 0xd0);
    img.minBlVersion = 1;
    img.status = "RELEASED";
    return img;
}

function setup(state: FwJobState = "CREATED", size = 1000) {
    resetFwCachesForTest();
    const store = new MemoryStore();
    const img = image(size);
    store.images.set(img._id, img);
    const job = new FwUpdateJob();
    job._id = 1;
    job.deviceId = DEVICE_ID;
    job.jobSeq = 7;
    job.imageId = img._id;
    job.targetVersion = "1.8.9";
    job.targetBuild = 140;
    job.state = state;
    job.chunkSize = 256;
    job.chunksTotal = Math.ceil(size / 256);
    job.expiresAt = new Date(NOW.getTime() + 14 * 86400_000);
    store.jobs.push(job);
    return { store, img };
}

const OLD: FwVersionTrailer = { major: 1, minor: 8, patch: 8, build: 128, blVersion: 1 };
const NEW: FwVersionTrailer = { major: 1, minor: 8, patch: 9, build: 140, blVersion: 1 };

// service uplink bodies exactly as ota.cpp builds them
function chunkReq(jobSeq: number, idx: number): Buffer {
    const p = Buffer.alloc(5);
    p[0] = FW_CHUNK_REQ; p.writeUInt16LE(jobSeq, 1); p.writeUInt16LE(idx, 3);
    return p;
}
function report(jobSeq: number, status: number, detail = 0): Buffer {
    const p = Buffer.alloc(8);
    p[0] = FW_REPORT; p.writeUInt16LE(jobSeq, 1); p[3] = status; p.writeUInt32LE(detail, 4);
    return p;
}
const at = (s: number) => new Date(NOW.getTime() + s * 1000);

// --- protocol ---

describe("fw protocol", () => {
    // a real packetType 0 uplink (test/measurement-service.test.ts), header stripped
    const type0 = Buffer.from("163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78", "hex");
    const payload0 = type0.subarray(17);

    test("packetType 0 payload is 35 bytes + CMAC", () => {
        expect(payload0.length).toBe(39);
    });

    test("packetType 2 splits into the type 0 payload and the version trailer", () => {
        const trailer = Buffer.from([1, 8, 9, 140, 0, 1]); // 1.8.9+140, bootloader level 1
        const payload2 = Buffer.concat([payload0.subarray(0, 35), trailer, payload0.subarray(35)]);
        expect(17 + payload2.length).toBe(62); // as sent by ota-nbiot firmware
        const split = splitMeasurementFw(payload2)!;
        expect(split.measurement.equals(payload0)).toBe(true);
        expect(split.version).toEqual({ major: 1, minor: 8, patch: 9, build: 140, blVersion: 1 });
        const m2 = uplinkPacket.decode(new Uint8Array(split.measurement), true);
        const m0 = uplinkPacket.decode(new Uint8Array(payload0), true);
        expect(m2).toEqual(m0);
    });

    test("packetType 3 splits into the type 0 payload, version and health trailers", () => {
        const trailer = Buffer.from([1, 8, 10, 30, 1, 1, 8, 2, 1, 3]); // 1.8.10+286, level 1; SEND_FAILED, 2 re-attaches, 1 recovered, 3 failed sends
        const payload3 = Buffer.concat([payload0.subarray(0, 35), trailer, payload0.subarray(35)]);
        expect(17 + payload3.length).toBe(66);
        const split = splitMeasurementFw(payload3, true)!;
        expect(split.measurement.equals(payload0)).toBe(true);
        expect(split.version).toEqual({ major: 1, minor: 8, patch: 10, build: 286, blVersion: 1 });
        expect(split.health).toEqual({ resetCause: 8, reattachAttempts: 2, reattachRecovered: 1, failedSends: 3 });
        expect(splitMeasurementFw(payload3)).toBeUndefined(); // not a type 2 length
    });

    test("health follow-up and change detection", () => {
        const quiet = { resetCause: 0, reattachAttempts: 0, reattachRecovered: 0, failedSends: 0 };
        expect(needsFollowUp(quiet)).toBe(false);
        expect(needsFollowUp({ ...quiet, resetCause: 21 })).toBe(true);
        expect(needsFollowUp({ ...quiet, reattachAttempts: 1 })).toBe(true);
        expect(resetCauseName(21)).toBe("STALL");
        expect(resetCauseName(99)).toBe("UNKNOWN_99");
        expect(healthChanged(undefined, quiet)).toBe(true);
        const stored = Object.assign(new DeviceHealth(), { lastResetCause: 0, reattachAttempts: 0, reattachRecovered: 0, failedSends: 0 });
        expect(healthChanged(stored, quiet)).toBe(false);
        expect(healthChanged(stored, { ...quiet, failedSends: 1 })).toBe(true);
    });

    test("packetType 2 with the wrong length is rejected", () => {
        expect(splitMeasurementFw(payload0)).toBeUndefined();
    });

    test("offer layout matches ota.cpp handleOffer", () => {
        const dat = Buffer.alloc(116, 0xd0);
        const o = encodeOffer({ jobSeq: 0x0207, major: 1, minor: 8, patch: 9, build: 140, size: 122724, chunkSize: 256, dat });
        expect(o[0]).toBe(DOWNLINK_FW_OFFER);
        const p = o.subarray(1);
        expect(p.readUInt16LE(0)).toBe(0x0207);
        expect([p[2], p[3], p[4]]).toEqual([1, 8, 9]);
        expect(p.readUInt16LE(5)).toBe(140);
        expect(p.readUInt32LE(7)).toBe(122724);
        expect(p.readUInt16LE(11)).toBe(256);
        expect(p[13]).toBe(116);
        expect(p.subarray(14).equals(dat)).toBe(true);
    });

    test("service uplinks decode", () => {
        expect(decodeServiceUplink(chunkReq(7, 300))).toEqual({ cmd: FW_CHUNK_REQ, jobSeq: 7, chunkIdx: 300 });
        expect(decodeServiceUplink(report(7, 4, 0x103))).toEqual({ cmd: FW_REPORT, jobSeq: 7, status: 4, detail: 0x103 });
        expect(decodeServiceUplink(Buffer.from([0x10, 1]))).toBeUndefined();
        expect(decodeServiceUplink(Buffer.from([0x55, 0, 0, 0, 0]))).toBeUndefined();
    });

    test("versionCode orders versions and builds", () => {
        expect(versionCode(1, 8, 9, 0)).toBeGreaterThan(versionCode(1, 8, 8, 65535));
        expect(versionCode(1, 8, 8, 129)).toBeGreaterThan(versionCode(1, 8, 8, 128));
        expect(versionCode(255, 255, 255, 65535)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });
});

// --- job flow ---

describe("fw job flow", () => {
    test("happy path: offer, accept, chunks, verified, installed", async () => {
        const { store, img } = setup("CREATED", 1000);
        const d = device();

        const offer = (await offerFor(store, d, OLD, "t", at(0)))!;
        expect(offer[0]).toBe(DOWNLINK_FW_OFFER);
        expect(offer.readUInt16LE(1)).toBe(7);
        expect(offer.readUInt32LE(8)).toBe(1000);
        expect(store.stored().state).toBe("OFFERED");

        // the first offer may be lost: offered again
        expect((await offerFor(store, d, OLD, "t", at(60)))![0]).toBe(DOWNLINK_FW_OFFER);

        const ack = (await onServiceUplink(store, d, report(7, FwStatus.ACCEPTED), "t", at(61)))!;
        expect(ack[0]).toBe(DOWNLINK_FW_ACK);
        expect(store.stored().state).toBe("DOWNLOADING");

        // no more offers once downloading
        expect(await offerFor(store, d, OLD, "t", at(62))).toBeUndefined();

        const info = jest.spyOn(logger, "info") as unknown as jest.Mock;
        const received: Buffer[] = [];
        for (let i = 0; i < 4; i++) {
            const c = (await onServiceUplink(store, d, chunkReq(7, i), "t", at(63 + i)))!;
            expect(c[0]).toBe(DOWNLINK_FW_CHUNK);
            expect(c.readUInt16LE(1)).toBe(7);
            expect(c.readUInt16LE(3)).toBe(i);
            received.push(c.subarray(5));
        }
        expect(received[3].length).toBe(1000 - 3 * 256);
        expect(Buffer.concat(received).equals(img.binary)).toBe(true);
        expect(store.stored().nextChunk).toBe(4); // last chunk always written
        expect(info.mock.calls.some((c: unknown[]) => String(c[0]).startsWith("FW job %d: last chunk served") && c[2] === 4 && c[3] === 4)).toBe(true);
        info.mockRestore();

        await onServiceUplink(store, d, report(7, FwStatus.VERIFIED), "t", at(70));
        expect(store.stored().state).toBe("DOWNLOADED");

        // waiting for 3.6 V: old version keeps coming, job stays
        await onVersionReport(store, d, OLD, "t", at(80));
        expect(store.stored().state).toBe("DOWNLOADED");

        // after the install: first the measurement with the new version...
        await onVersionReport(store, d, NEW, "t", at(900));
        expect(store.stored().state).toBe("COMPLETED");
        expect(store.firmware.get(DEVICE_ID)!.reportedBuild).toBe(140);
        // ...then INSTALLED_CONFIRMED, acked every time without a change
        const writes = store.jobWrites;
        for (let i = 0; i < 3; i++) {
            const r = (await onServiceUplink(store, d, report(7, FwStatus.INSTALLED_CONFIRMED), "t", at(901 + i)))!;
            expect(r[0]).toBe(DOWNLINK_FW_ACK);
        }
        expect(store.jobWrites).toBe(writes);
    });

    test("version is written only when it changes", async () => {
        const { store } = setup("COMPLETED");
        const d = device();
        await onVersionReport(store, d, OLD, "t", at(0));
        await onVersionReport(store, d, OLD, "t", at(600));
        expect(store.firmwareWrites).toBe(1);
        await onVersionReport(store, d, { ...OLD, blVersion: 2 }, "t", at(1200));
        expect(store.firmwareWrites).toBe(2);
    });

    test("progress writes are throttled", async () => {
        const { store } = setup("DOWNLOADING", 256 * 100);
        const d = device();
        for (let i = 0; i < 40; i++) await onServiceUplink(store, d, chunkReq(7, i), "t", at(i)); // 1 chunk/s
        // first request (time), then every 16 chunks or 30 s
        expect(store.jobWrites).toBeLessThanOrEqual(5);
        expect(store.stored().nextChunk).toBeGreaterThanOrEqual(32);
    });

    test("no offer without a version trailer, to a class 4 device, or to stock bootloaders", async () => {
        const { store } = setup("CREATED");
        expect(await offerFor(store, device(), undefined, "t", at(0))).toBeUndefined();
        expect(await offerFor(store, device(4), OLD, "t", at(0))).toBeUndefined();
        expect(await offerFor(store, device(), { ...OLD, blVersion: 0 }, "t", at(0))).toBeUndefined();
        expect(store.stored().state).toBe("CREATED");
        const r = (await onServiceUplink(store, device(4), chunkReq(7, 0), "t", at(1)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ABORT);
    });

    test("cancelled job: chunk request and ACCEPTED get FW_ABORT, final reports get FW_ACK", async () => {
        const { store } = setup("CANCELLED");
        const d = device();
        let r = (await onServiceUplink(store, d, chunkReq(7, 3), "t", at(0)))!;
        expect([r[0], r[3]]).toEqual([DOWNLINK_FW_ABORT, FwAbortReason.CANCELLED]);
        r = (await onServiceUplink(store, d, report(7, FwStatus.VERIFIED), "t", at(1)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ABORT);
        r = (await onServiceUplink(store, d, report(7, FwStatus.FLASH_ERROR), "t", at(2)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ACK);
        r = (await onServiceUplink(store, d, chunkReq(99, 0), "t", at(3)))!;
        expect([r[0], r.readUInt16LE(1), r[3]]).toEqual([DOWNLINK_FW_ABORT, 99, FwAbortReason.UNKNOWN_JOB]);
    });

    test("admin cancels between read and write: the device gets FW_ABORT", async () => {
        const { store } = setup("DOWNLOADING");
        const d = device();
        const orig = store.findJob.bind(store);
        let first = true;
        store.findJob = async (id, seq) => {
            const j = await orig(id, seq);
            if (first) { first = false; store.stored().state = "CANCELLED"; } // races in after our read
            return j;
        };
        const r = (await onServiceUplink(store, d, chunkReq(7, 0), "t", at(0)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ABORT);
        expect(store.stored().state).toBe("CANCELLED");
    });

    test("expired job is closed lazily", async () => {
        const { store } = setup("OFFERED");
        expect(await offerFor(store, device(), OLD, "t", at(15 * 86400))).toBeUndefined();
        expect(store.stored().state).toBe("EXPIRED");
    });

    test("hash mismatch retries until maxAttempts", async () => {
        const { store } = setup("DOWNLOADING");
        const d = device();
        await onServiceUplink(store, d, report(7, FwStatus.VERIFY_FAILED, 2), "t", at(0));
        expect(store.stored().state).toBe("DOWNLOADING");
        await onServiceUplink(store, d, report(7, FwStatus.VERIFY_FAILED, 2), "t", at(1));
        expect(store.stored().state).toBe("DOWNLOADING");
        await onServiceUplink(store, d, report(7, FwStatus.VERIFY_FAILED, 2), "t", at(2));
        expect(store.stored().state).toBe("FAILED");
        expect(store.stored().lastError).toMatch(/^VERIFY/);
    });

    test("offer refused by the device fails the job without retry", async () => {
        const { store } = setup("OFFERED");
        await onServiceUplink(store, device(), report(7, FwStatus.VERIFY_FAILED, 3), "t", at(0));
        expect(store.stored().state).toBe("FAILED");
        expect(store.stored().lastError).toBe("OFFER_REFUSED 0x3");
    });

    test("same version offered: INSTALLED_CONFIRMED closes the job", async () => {
        const { store } = setup("OFFERED");
        const r = (await onServiceUplink(store, device(), report(7, FwStatus.INSTALLED_CONFIRMED), "t", at(0)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ACK);
        expect(store.stored().state).toBe("COMPLETED");
    });

    test("bootloader failures after the hand-off", async () => {
        let s = setup("DOWNLOADED").store;
        await onServiceUplink(s, device(), report(7, FwStatus.VERIFY_FAILED, 0x103), "t", at(0));
        expect(s.stored().state).toBe("CREATED"); // re-offered, the device dropped its job
        expect(s.stored().attempt).toBe(1);
        expect((await offerFor(s, device(), OLD, "t", at(1)))![0]).toBe(DOWNLINK_FW_OFFER);

        s = setup("DOWNLOADED").store;
        await onServiceUplink(s, device(), report(7, FwStatus.VERIFY_FAILED, 0x102), "t", at(0));
        expect([s.stored().state, s.stored().lastError]).toEqual(["FAILED", "BL_SIGNATURE 0x102"]);

        s = setup("DOWNLOADED").store;
        await onServiceUplink(s, device(), report(7, FwStatus.VERIFY_FAILED, 0x100), "t", at(0));
        expect([s.stored().state, s.stored().lastError]).toEqual(["FAILED", "BL_INSTALL 0x100"]);
    });

    test("deferred for battery stays offered and counts", async () => {
        const { store } = setup("OFFERED");
        const r = (await onServiceUplink(store, device(), report(7, FwStatus.DEFERRED_BATTERY, 3550), "t", at(0)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ACK);
        expect([store.stored().state, store.stored().deferrals]).toEqual(["OFFERED", 1]);
    });

    test("a scale that resets on the offer: the job fails after 3 unanswered offers", async () => {
        const { store } = setup("CREATED");
        const d = device();
        for (let i = 0; i < 3; i++) expect((await offerFor(store, d, OLD, "t", at(i * 120)))![0]).toBe(DOWNLINK_FW_OFFER);
        expect(await offerFor(store, d, OLD, "t", at(360))).toBeUndefined();
        expect([store.stored().state, store.stored().lastError]).toEqual(["FAILED", "CRASH_ON_OFFER"]);
    });

    test("an answered offer resets the count: battery deferrals do not fail the job", async () => {
        const { store } = setup("CREATED");
        const d = device();
        for (let i = 0; i < 6; i++) {
            expect((await offerFor(store, d, OLD, "t", at(i * 3600)))![0]).toBe(DOWNLINK_FW_OFFER);
            await onServiceUplink(store, d, report(7, FwStatus.DEFERRED_BATTERY, 3550), "t", at(i * 3600 + 5));
        }
        expect([store.stored().state, store.stored().deferrals]).toEqual(["OFFERED", 6]);
    });

    test("chunk index past the end is refused", async () => {
        const { store } = setup("DOWNLOADING", 1000);
        const r = (await onServiceUplink(store, device(), chunkReq(7, 4), "t", at(0)))!;
        expect([r[0], r[3]]).toEqual([DOWNLINK_FW_ABORT, FwAbortReason.BAD_REQUEST]);
    });

    test("withdrawn image fails the job", async () => {
        const { store, img } = setup("DOWNLOADING");
        img.status = "WITHDRAWN";
        const r = (await onServiceUplink(store, device(), chunkReq(7, 0), "t", at(0)))!;
        expect(r[0]).toBe(DOWNLINK_FW_ABORT);
        expect(store.stored().lastError).toBe("IMAGE_UNAVAILABLE");
    });
});
