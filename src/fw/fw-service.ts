import { Device } from "../model/device";
import { DeviceFirmware } from "../model/device-firmware.entity";
import { FirmwareImage } from "../model/firmware-image.entity";
import { ACTIVE_JOB_STATES, FwJobState, FwUpdateJob } from "../model/fw-update-job.entity";
import logger, { evt, LogFields } from "../utils/logger";
import {
    decodeServiceUplink, encodeAbort, encodeAck, encodeChunk, encodeOffer,
    FW_CHUNK_REQ, FW_REPORT, FwAbortReason, FwStatus, FwVersionTrailer,
    VERIFY_DETAIL_BOOTLOADER, VERIFY_DETAIL_HASH, VERIFY_DETAIL_SIGNATURE, VERIFY_DETAIL_SIZE,
    versionCode, versionString,
} from "./fw-protocol";
import { FwStore } from "./fw-store";

// Firmware update over NB-IoT, server side (design doc sections 4-6).
// Every function returns the downlink to send as "type byte + body" (the
// Device.downlinkData format), or undefined for no reply.

const PROGRESS_SAVE_EVERY_CHUNKS = 16;
const PROGRESS_SAVE_EVERY_MS = 30_000;
const IMAGE_CACHE_SIZE = 4;

// FW_ACK newState byte; the firmware ignores it, it is there for logs and captures
const ACK_STATE_CODE: Record<FwJobState, number> = {
    CREATED: 1, OFFERED: 2, DOWNLOADING: 3, DOWNLOADED: 4,
    COMPLETED: 5, FAILED: 6, CANCELLED: 7, EXPIRED: 8,
};

const imageCache = new Map<string, FirmwareImage>(); // images are immutable
const progressSavedAt = new Map<number, number>();   // job id -> ms of the last progress write

export function resetFwCachesForTest() {
    imageCache.clear();
    progressSavedAt.clear();
}

function isActive(job: FwUpdateJob): boolean {
    return ACTIVE_JOB_STATES.includes(job.state);
}

function deviceCtx(device: Device, trace: string): LogFields {
    return { trace, device: device.address, deviceName: device.name, deviceId: device._id };
}

function jobCtx(device: Device, trace: string, job: FwUpdateJob): LogFields {
    return { ...deviceCtx(device, trace), jobId: job._id, jobSeq: job.jobSeq, jobState: job.state };
}

async function loadImage(store: FwStore, imageId: string): Promise<FirmwareImage | undefined> {
    const cached = imageCache.get(imageId);
    if (cached) {
        imageCache.delete(imageId); // LRU: move to the end
        imageCache.set(imageId, cached);
        return cached;
    }
    const image = await store.findImage(imageId);
    if (image) {
        imageCache.set(imageId, image);
        if (imageCache.size > IMAGE_CACHE_SIZE) imageCache.delete(imageCache.keys().next().value!);
    }
    return image;
}

function abortReasonFor(state: FwJobState): FwAbortReason {
    switch (state) {
        case "CANCELLED": return FwAbortReason.CANCELLED;
        case "EXPIRED": return FwAbortReason.EXPIRED;
        case "FAILED": return FwAbortReason.FAILED;
        case "COMPLETED": return FwAbortReason.COMPLETED;
        default: return FwAbortReason.UNKNOWN_JOB;
    }
}

function finish(job: FwUpdateJob, state: FwJobState, now: Date, error?: string) {
    job.state = state;
    job.finishedAt = now;
    if (error !== undefined) job.lastError = error;
}

/**
 * Apply a change to the job and store it, unless admin-api moved it meanwhile.
 * Returns the job as stored afterwards (the fresh one on a conflict).
 */
async function commit(store: FwStore, job: FwUpdateJob, now: Date, change: (job: FwUpdateJob) => void): Promise<FwUpdateJob> {
    const expected = job.state;
    change(job);
    job.lastActivityAt = now;
    if (await store.updateJob(job, expected)) {
        progressSavedAt.set(job._id, now.getTime());
        return job;
    }
    const fresh = await store.findJob(job.deviceId, job.jobSeq);
    return fresh ?? job;
}

/** Lazy expiry: admin-api's sweep may not have run yet. */
async function expireIfDue(store: FwStore, job: FwUpdateJob, now: Date, ctx: LogFields): Promise<FwUpdateJob> {
    if (isActive(job) && job.expiresAt && job.expiresAt.getTime() < now.getTime()) {
        logger.info("FW job %d expired", job._id, evt("fw", ctx));
        return commit(store, job, now, j => finish(j, "EXPIRED", now));
    }
    return job;
}

/**
 * A packetType 2 uplink: remember the running firmware (written only when it
 * changed) and close the active job when the device runs its target.
 */
export async function onVersionReport(store: FwStore, device: Device, v: FwVersionTrailer, trace: string, now = new Date()): Promise<void> {
    const ctx = deviceCtx(device, trace);
    const version = versionString(v);
    let df = await store.findDeviceFirmware(device._id);
    if (!df || df.reportedVersion !== version || df.reportedBuild !== v.build || df.bootloaderVersion !== v.blVersion) {
        logger.info("Firmware %s+%d, bootloader OTA level %d (was %s)", version, v.build, v.blVersion,
            df ? `${df.reportedVersion}+${df.reportedBuild}, level ${df.bootloaderVersion}` : "unknown", evt("fw", ctx));
        if (!df) {
            df = new DeviceFirmware();
            df._id = device._id;
        }
        df.reportedVersion = version;
        df.reportedBuild = v.build;
        df.reportedVersionCode = versionCode(v.major, v.minor, v.patch, v.build);
        df.bootloaderVersion = v.blVersion;
        df.reportedAt = now;
        await store.saveDeviceFirmware(df);
    }

    let job = await store.findActiveJob(device._id);
    if (!job) return;
    job = await expireIfDue(store, job, now, jobCtx(device, trace, job));
    if (!isActive(job)) return;
    if (job.targetVersion === version && job.targetBuild === v.build) {
        logger.info("FW job %d completed: device runs %s+%d", job._id, version, v.build, evt("fw", jobCtx(device, trace, job)));
        await commit(store, job, now, j => finish(j, "COMPLETED", now, ""));
    }
    // An old version while DOWNLOADED is normal: the scale waits for 3.6 V
    // before it installs. A failed install comes as a VERIFY_FAILED report.
}

/**
 * The device asked for a downlink: offer the active job if it has not started
 * downloading yet. Re-offered on every request, the first offer may be lost.
 */
export async function offerFor(store: FwStore, device: Device, v: FwVersionTrailer | undefined, trace: string, now = new Date()): Promise<Buffer | undefined> {
    if (device.deviceClass === 4) return undefined; // no CMAC, nothing authenticated
    let job = await store.findActiveJob(device._id);
    if (!job) return undefined;
    const ctx = jobCtx(device, trace, job);
    job = await expireIfDue(store, job, now, ctx);
    if (job.state !== "CREATED" && job.state !== "OFFERED") return undefined;
    if (!v) {
        logger.info("FW job %d waits: device sends no firmware version (packetType 0)", job._id, evt("fw", ctx));
        return undefined;
    }
    const image = await loadImage(store, job.imageId);
    if (!image || image.status === "WITHDRAWN") {
        logger.warn("FW job %d: image %s missing or withdrawn", job._id, job.imageId, evt("fw", ctx));
        await commit(store, job, now, j => finish(j, "FAILED", now, "IMAGE_UNAVAILABLE"));
        return undefined;
    }
    if (v.blVersion < Math.max(1, image.minBlVersion)) {
        logger.warn("FW job %d waits: bootloader OTA level %d, image needs %d", job._id, v.blVersion, image.minBlVersion, evt("fw", ctx));
        return undefined;
    }
    const stored = await commit(store, job, now, j => {
        j.state = "OFFERED";
        if (!j.offeredAt) j.offeredAt = now;
    });
    if (stored.state !== "OFFERED") return undefined;
    const target = versionParts(job.targetVersion);
    logger.info("FW job %d: offer %s+%d, %d bytes, chunk %d", job._id, job.targetVersion, job.targetBuild, image.size, job.chunkSize, evt("fw", ctx));
    return encodeOffer({
        jobSeq: job.jobSeq, ...target, build: job.targetBuild,
        size: image.size, chunkSize: job.chunkSize, dat: image.initPacket,
    });
}

function versionParts(version: string) {
    const [major, minor, patch] = version.split(".").map(Number);
    return { major, minor, patch };
}

/** A packetType 1 uplink (payload without its CMAC). Always answered. */
export async function onServiceUplink(store: FwStore, device: Device, body: Buffer, trace: string, now = new Date()): Promise<Buffer | undefined> {
    const ctx = deviceCtx(device, trace);
    const msg = decodeServiceUplink(body);
    if (!msg) {
        logger.warn("Unknown service uplink %s", body.toString("hex"), evt("fw", ctx));
        return undefined;
    }
    if (device.deviceClass === 4) {
        logger.warn("FW service uplink from a class 4 device refused", evt("fw", ctx));
        return encodeAbort(msg.jobSeq, FwAbortReason.BAD_REQUEST);
    }
    let job = await store.findJob(device._id, msg.jobSeq);
    if (job) job = await expireIfDue(store, job, now, jobCtx(device, trace, job));

    if (msg.cmd === FW_CHUNK_REQ) return serveChunk(store, device, job, msg.jobSeq, msg.chunkIdx, trace, now);
    return handleReport(store, device, job, msg.jobSeq, msg.status, msg.detail, trace, now);
}

async function serveChunk(store: FwStore, device: Device, job: FwUpdateJob | undefined, jobSeq: number, chunkIdx: number, trace: string, now: Date): Promise<Buffer> {
    if (!job || !isActive(job)) {
        logger.info("FW chunk %d for job seq %d: job %s, abort", chunkIdx, jobSeq, job ? job.state : "unknown", evt("fw", deviceCtx(device, trace)));
        return encodeAbort(jobSeq, job ? abortReasonFor(job.state) : FwAbortReason.UNKNOWN_JOB);
    }
    const ctx = jobCtx(device, trace, job);
    const image = await loadImage(store, job.imageId);
    if (!image || image.status === "WITHDRAWN") {
        await commit(store, job, now, j => finish(j, "FAILED", now, "IMAGE_UNAVAILABLE"));
        return encodeAbort(jobSeq, FwAbortReason.FAILED);
    }
    if (chunkIdx >= job.chunksTotal) {
        logger.warn("FW chunk %d out of range (%d chunks)", chunkIdx, job.chunksTotal, evt("fw", ctx));
        return encodeAbort(jobSeq, FwAbortReason.BAD_REQUEST);
    }
    const start = chunkIdx * job.chunkSize;
    const data = image.binary.subarray(start, Math.min(start + job.chunkSize, image.size));

    // state changes are written at once, progress at most every 16 chunks or 30 s
    const last = chunkIdx + 1 >= job.chunksTotal;
    const dueByCount = (chunkIdx + 1) % PROGRESS_SAVE_EVERY_CHUNKS === 0;
    const dueByTime = now.getTime() - (progressSavedAt.get(job._id) ?? 0) >= PROGRESS_SAVE_EVERY_MS;
    if (job.state !== "DOWNLOADING" || last || dueByCount || dueByTime) {
        if (job.state !== "DOWNLOADING") logger.info("FW job %d downloading", job._id, evt("fw", ctx));
        const stored = await commit(store, job, now, j => {
            j.state = "DOWNLOADING";
            j.nextChunk = chunkIdx + 1;
        });
        if (!isActive(stored)) return encodeAbort(jobSeq, abortReasonFor(stored.state));
        if (last) logger.info("FW job %d: last chunk served (%d/%d), waiting for VERIFIED", job._id, chunkIdx + 1, job.chunksTotal, evt("fw", ctx));
        else logger.info("FW job %d: chunk %d/%d", job._id, chunkIdx + 1, job.chunksTotal, evt("fw", ctx));
    }
    return encodeChunk(jobSeq, chunkIdx, data);
}

async function handleReport(store: FwStore, device: Device, job: FwUpdateJob | undefined, jobSeq: number, status: number, detail: number, trace: string, now: Date): Promise<Buffer> {
    const ctx = job ? jobCtx(device, trace, job) : deviceCtx(device, trace);
    logger.info("FW report job seq %d: status %d (%s), detail 0x%s", jobSeq, status, FwStatus[status] ?? "?", detail.toString(16), evt("fw", ctx));

    // Reports that ask the device to go on are refused for a job that is gone;
    // final reports are always acked so the device can clear its state.
    const goOn = status === FwStatus.ACCEPTED || status === FwStatus.VERIFIED || status === FwStatus.DEFERRED_BATTERY;
    if (!job || !isActive(job)) {
        if (goOn) return encodeAbort(jobSeq, job ? abortReasonFor(job.state) : FwAbortReason.UNKNOWN_JOB);
        return encodeAck(jobSeq, job ? ACK_STATE_CODE[job.state] : 0);
    }

    const before = job.state;
    let stored = job;
    switch (status) {
        case FwStatus.ACCEPTED:
            if (job.state === "CREATED" || job.state === "OFFERED") {
                stored = await commit(store, job, now, j => { j.state = "DOWNLOADING"; });
            }
            break;
        case FwStatus.DEFERRED_BATTERY:
            stored = await commit(store, job, now, j => {
                j.deferrals++;
                j.lastError = `DEFERRED_BATTERY ${detail} mV`;
            });
            break;
        case FwStatus.VERIFIED:
            stored = await commit(store, job, now, j => {
                j.state = "DOWNLOADED";
                j.nextChunk = j.chunksTotal;
            });
            break;
        case FwStatus.VERIFY_FAILED:
            stored = await commit(store, job, now, j => onVerifyFailed(j, detail, now));
            break;
        case FwStatus.FLASH_ERROR:
            stored = await commit(store, job, now, j => finish(j, "FAILED", now, "FLASH"));
            break;
        case FwStatus.INSTALLED_CONFIRMED:
            stored = await commit(store, job, now, j => finish(j, "COMPLETED", now, ""));
            break;
        case FwStatus.ROLLED_BACK:
            stored = await commit(store, job, now, j => finish(j, "FAILED", now, `ROLLED_BACK build ${detail}`));
            break;
        default:
            logger.warn("FW report with unknown status %d", status, evt("fw", ctx));
    }
    if (stored.state !== before) {
        logger.info("FW job %d now %s %s", stored._id, stored.state, stored.lastError, evt("fw", ctx));
    }
    if (goOn && !isActive(stored)) return encodeAbort(jobSeq, abortReasonFor(stored.state));
    return encodeAck(jobSeq, ACK_STATE_CODE[stored.state]);
}

function onVerifyFailed(job: FwUpdateJob, detail: number, now: Date) {
    const hex = `0x${detail.toString(16)}`;
    if (job.state === "CREATED" || job.state === "OFFERED") {
        // the device refused the offer: wrong size/chunk size, bad init packet, or no OTA bootloader
        finish(job, "FAILED", now, `OFFER_REFUSED ${hex}`);
        return;
    }
    if (detail >= VERIFY_DETAIL_BOOTLOADER) {
        const reason = detail - VERIFY_DETAIL_BOOTLOADER;
        if (reason === 3) {
            // image hash wrong in bank 1 at install time; the device has dropped
            // its job, so start over with a new offer
            job.attempt++;
            if (job.attempt >= job.maxAttempts) finish(job, "FAILED", now, `BL_HASH ${hex}`);
            else { job.state = "CREATED"; job.nextChunk = 0; job.lastError = `BL_HASH ${hex}, retry`; }
        } else if (reason === 2) {
            finish(job, "FAILED", now, `BL_SIGNATURE ${hex}`);
        } else {
            finish(job, "FAILED", now, `BL_INSTALL ${hex}`);
        }
        return;
    }
    if (detail === VERIFY_DETAIL_SIGNATURE) {
        finish(job, "FAILED", now, `SIGNATURE ${hex}`);
        return;
    }
    if (detail === VERIFY_DETAIL_HASH || detail === VERIFY_DETAIL_SIZE) {
        // the device restarts from chunk 0 by itself
        job.attempt++;
        if (job.attempt >= job.maxAttempts) finish(job, "FAILED", now, `VERIFY ${hex}`);
        else { job.state = "DOWNLOADING"; job.nextChunk = 0; job.lastError = `VERIFY ${hex}, retry`; }
        return;
    }
    finish(job, "FAILED", now, `VERIFY ${hex}`);
}
