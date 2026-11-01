// Over-the-air firmware update wire format (udpsrv <-> NB-IoT scale).
// Contract: notes/scale-fw-update-server-design.md section 4, firmware side
// src/ota.cpp in beepad-scale-arduino. Little-endian throughout. The outer
// uplink/downlink header and the CMAC are handled by apn-service as for every
// other packet; this module only deals with the payloads.

// uplink packet types (UplinkPacketHeader.packetType)
export const UPLINK_MEASUREMENT = 0;
export const UPLINK_SERVICE = 1;
export const UPLINK_MEASUREMENT_FW = 2; // measurement + 6-byte firmware version trailer
export const UPLINK_MEASUREMENT_HEALTH = 3; // type 2 + 4-byte health trailer

// service uplink commands (first payload byte of packetType 1)
export const FW_CHUNK_REQ = 0x10;
export const FW_REPORT = 0x11;

// downlink packet types
export const DOWNLINK_FW_OFFER = 0x10;
export const DOWNLINK_FW_CHUNK = 0x11;
export const DOWNLINK_FW_ABORT = 0x12;
export const DOWNLINK_FW_ACK = 0x13;

// FW_REPORT status codes
export enum FwStatus {
    ACCEPTED = 1,
    DEFERRED_BATTERY = 2,    // detail = battery mV
    VERIFIED = 3,
    VERIFY_FAILED = 4,       // detail 1 signature/init packet, 2 hash, 3 size; >= 0x100 bootloader
    FLASH_ERROR = 5,
    INSTALLED_CONFIRMED = 6,
    ROLLED_BACK = 7,
}

export const VERIFY_DETAIL_SIGNATURE = 1;
export const VERIFY_DETAIL_HASH = 2;
export const VERIFY_DETAIL_SIZE = 3;
export const VERIFY_DETAIL_BOOTLOADER = 0x100; // + bootloader fail_reason (1 bad request, 2 init packet/signature, 3 image hash)

// FW_ABORT reasons
export enum FwAbortReason {
    UNKNOWN_JOB = 1,
    CANCELLED = 2,
    EXPIRED = 3,
    FAILED = 4,
    BAD_REQUEST = 5,
    COMPLETED = 6,
}

export const CHUNK_SIZE_DEFAULT = 448; // a ~970-char URC on the scale; fewer round trips
export const CHUNK_SIZE_MAX = 448; // device hard limit is 472 (1024-char URC line)

export interface FwVersionTrailer {
    major: number;
    minor: number;
    patch: number;
    build: number;
    blVersion: number; // bootloader OTA capability, 0 = stock bootloader
}

/** Scale health since its last boot (packetType 3), counters saturate at 255. */
export interface HealthTrailer {
    resetCause: number;        // why the scale last restarted, RESET_CAUSE_* in the firmware's resetcause.h
    reattachAttempts: number;  // modem re-attaches (radio off/on) after a failed exchange
    reattachRecovered: number; // re-attaches after which the retried send went out
    failedSends: number;       // exchanges the modem failed
}

export const MEASUREMENT_BODY_SIZE = 35; // packetType 0 payload without its 4-byte CMAC
export const FW_TRAILER_SIZE = 6;
export const HEALTH_TRAILER_SIZE = 4;

/**
 * Split a packetType 2 or 3 payload (everything after the 17-byte header, CMAC
 * included) into a packetType 0 payload and the trailers, so the measurement
 * goes through the existing decoder unchanged.
 */
export function splitMeasurementFw(payload: Buffer, withHealth = false): { measurement: Buffer; version: FwVersionTrailer; health?: HealthTrailer } | undefined {
    const trailers = FW_TRAILER_SIZE + (withHealth ? HEALTH_TRAILER_SIZE : 0);
    if (payload.length !== MEASUREMENT_BODY_SIZE + trailers + 4) return undefined;
    const t = payload.subarray(MEASUREMENT_BODY_SIZE, MEASUREMENT_BODY_SIZE + trailers);
    const measurement = Buffer.concat([
        payload.subarray(0, MEASUREMENT_BODY_SIZE),
        payload.subarray(MEASUREMENT_BODY_SIZE + trailers),
    ]);
    const h = t.subarray(FW_TRAILER_SIZE);
    return {
        measurement,
        version: { major: t[0], minor: t[1], patch: t[2], build: t.readUInt16LE(3), blVersion: t[5] },
        health: withHealth ? { resetCause: h[0], reattachAttempts: h[1], reattachRecovered: h[2], failedSends: h[3] } : undefined,
    };
}

export function versionString(v: { major: number; minor: number; patch: number }): string {
    return `${v.major}.${v.minor}.${v.patch}`;
}

/** Same ordering key as FirmwareImage.versionCode. */
export function versionCode(major: number, minor: number, patch: number, build: number): number {
    // major<<40 | minor<<32 | patch<<24 | build, kept below 2^53
    return ((major * 256 + minor) * 256 + patch) * 2 ** 24 + build;
}

export function parseVersion(version: string): { major: number; minor: number; patch: number } {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!m) throw new Error(`bad version ${version}, expected major.minor.patch`);
    const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (major > 255 || minor > 255 || patch > 255) throw new Error(`version ${version} out of range`);
    return { major, minor, patch };
}

export type ServiceUplink =
    | { cmd: typeof FW_CHUNK_REQ; jobSeq: number; chunkIdx: number }
    | { cmd: typeof FW_REPORT; jobSeq: number; status: number; detail: number };

/** Decode a packetType 1 payload without its CMAC. */
export function decodeServiceUplink(body: Buffer): ServiceUplink | undefined {
    if (body.length < 1) return undefined;
    const cmd = body[0];
    if (cmd === FW_CHUNK_REQ && body.length >= 5) {
        return { cmd, jobSeq: body.readUInt16LE(1), chunkIdx: body.readUInt16LE(3) };
    }
    if (cmd === FW_REPORT && body.length >= 8) {
        return { cmd, jobSeq: body.readUInt16LE(1), status: body[3], detail: body.readUInt32LE(4) };
    }
    return undefined;
}

// Downlinks are returned as "type byte + body", the format createDownlinkMessage
// already takes for Device.downlinkData.

export interface FwOffer {
    jobSeq: number;
    major: number;
    minor: number;
    patch: number;
    build: number;
    size: number;
    chunkSize: number;
    dat: Buffer;
}

export function encodeOffer(o: FwOffer): Buffer {
    if (o.dat.length > 255) throw new Error("init packet longer than 255 bytes");
    const b = Buffer.alloc(1 + 14 + o.dat.length);
    b[0] = DOWNLINK_FW_OFFER;
    b.writeUInt16LE(o.jobSeq, 1);
    b[3] = o.major;
    b[4] = o.minor;
    b[5] = o.patch;
    b.writeUInt16LE(o.build, 6);
    b.writeUInt32LE(o.size, 8);
    b.writeUInt16LE(o.chunkSize, 12);
    b[14] = o.dat.length;
    o.dat.copy(b, 15);
    return b;
}

export function encodeChunk(jobSeq: number, chunkIdx: number, data: Buffer): Buffer {
    const b = Buffer.alloc(5 + data.length);
    b[0] = DOWNLINK_FW_CHUNK;
    b.writeUInt16LE(jobSeq, 1);
    b.writeUInt16LE(chunkIdx, 3);
    data.copy(b, 5);
    return b;
}

export function encodeAbort(jobSeq: number, reason: FwAbortReason): Buffer {
    const b = Buffer.alloc(4);
    b[0] = DOWNLINK_FW_ABORT;
    b.writeUInt16LE(jobSeq, 1);
    b[3] = reason;
    return b;
}

export function encodeAck(jobSeq: number, state: number): Buffer {
    const b = Buffer.alloc(4);
    b[0] = DOWNLINK_FW_ACK;
    b.writeUInt16LE(jobSeq, 1);
    b[3] = state;
    return b;
}
