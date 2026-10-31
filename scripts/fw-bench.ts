// Bench tool for NB-IoT firmware updates until admin-api has the endpoints
// (design doc section 7.1). Writes the same Datastore kinds admin-api will:
// FirmwareImage, FwUpdateJob, DeviceFirmware.lastJobSeq.
//
//   GOOGLE_SERVICE_ACCOUNT=... npx ts-node scripts/fw-bench.ts <command> [options]
//
//   upload  --zip signed.zip [--version 1.8.9 --build 140] [--hw PROD_V2] [--status DRAFT|RELEASED] [--note text]
//           signed package from notes/bootloader-ota/signpkg.py; the version is
//           read from the image's "x.y.z+build" string when not given
//   images
//   job     --device <address|name|id> --image <imageId> [--chunk 256] [--days 14] [--force]
//   status  --device <address|name|id>
//   cancel  --device <address|name|id>
//
// It only reads the signed package; the private key never comes near it.

import { execFileSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { Connection, createConnection } from "ts-datastore-orm";
import { Device } from "../src/model/device";
import { DeviceFirmware } from "../src/model/device-firmware.entity";
import { FirmwareImage } from "../src/model/firmware-image.entity";
import { ACTIVE_JOB_STATES, FwUpdateJob } from "../src/model/fw-update-job.entity";
import { CHUNK_SIZE_DEFAULT, CHUNK_SIZE_MAX, parseVersion, versionCode } from "../src/fw/fw-protocol";

const STAGING_MAX_IMAGE_SIZE = 0x23000; // bank 1 on the scale (fw_staging.h)
const DAT_SIZE = 116; // legacy init 12 + {type u32, len u32, sha256[32]} + r[32] s[32]

function args(argv: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith("--")) continue;
        const key = argv[i].slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) out[key] = "true";
        else { out[key] = next; i++; }
    }
    return out;
}

function unzipEntry(zip: string, entry: string): Buffer {
    return execFileSync("unzip", ["-p", zip, entry], { maxBuffer: 4 * 1024 * 1024 });
}

/** Check a signed package and return its parts. Does not verify the signature (the scale and the bootloader do). */
export function readPackage(binary: Buffer, dat: Buffer) {
    if (dat.length !== DAT_SIZE) throw new Error(`init packet is ${dat.length} bytes, expected ${DAT_SIZE} (signed with signpkg.py?)`);
    if (dat.readUInt32LE(12) !== 2) throw new Error("init packet has no hash extension");
    if (dat.readUInt32LE(16) !== binary.length) throw new Error(`init packet length ${dat.readUInt32LE(16)} != image ${binary.length}`);
    const sha = createHash("sha256").update(binary).digest();
    if (!dat.subarray(20, 52).equals(sha)) throw new Error("init packet hash does not match the image");
    if (binary.length > STAGING_MAX_IMAGE_SIZE) throw new Error(`image ${binary.length} bytes is larger than bank 1 (${STAGING_MAX_IMAGE_SIZE})`);
    // APP_VERSION_FULL ("1.8.9+140") is compiled into the image
    const m = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\+(\d{1,5})/.exec(binary.toString("latin1"));
    const embedded = m ? { version: `${m[1]}.${m[2]}.${m[3]}`, build: Number(m[4]) } : undefined;
    return { sha256: sha.toString("hex"), embedded };
}

async function findDevice(connection: Connection, ref: string): Promise<Device> {
    const repo = connection.getRepository(Device);
    let d = await repo.query().filter("address", ref).findOne();
    if (!d && /^\d+$/.test(ref)) d = await repo.findOne(Number(ref));
    if (!d) d = (await repo.query().findMany()).find(x => x.name === ref);
    if (!d) throw new Error(`device ${ref} not found`);
    return d;
}

async function upload(connection: Connection, a: Record<string, string>) {
    if (!a.zip) throw new Error("--zip is required");
    const manifest = JSON.parse(unzipEntry(a.zip, "manifest.json").toString()).manifest.application;
    const binary = unzipEntry(a.zip, manifest.bin_file);
    const dat = unzipEntry(a.zip, manifest.dat_file);
    const pkg = readPackage(binary, dat);
    const version = a.version ?? pkg.embedded?.version;
    const build = a.build !== undefined ? Number(a.build) : pkg.embedded?.build;
    if (!version || build === undefined) throw new Error("version not found in the image, pass --version and --build");
    if (pkg.embedded && (pkg.embedded.version !== version || pkg.embedded.build !== build)) {
        throw new Error(`image says ${pkg.embedded.version}+${pkg.embedded.build}, arguments say ${version}+${build}`);
    }
    const v = parseVersion(version);
    const img = new FirmwareImage();
    img._id = randomUUID();
    img.hwVersion = a.hw ?? "PROD_V2";
    img.version = version;
    img.buildNumber = build;
    img.versionCode = versionCode(v.major, v.minor, v.patch, build);
    img.size = binary.length;
    img.sha256 = pkg.sha256;
    img.initPacket = dat;
    img.binary = binary;
    img.minBlVersion = a["min-bl"] ? Number(a["min-bl"]) : 1;
    img.status = a.status ?? "DRAFT";
    img.note = a.note ?? "";
    img.uploadedAt = new Date();
    await connection.getRepository(FirmwareImage).insert(img);
    console.log(`image ${img._id}: ${version}+${build}, ${img.size} bytes, sha256 ${img.sha256.slice(0, 16)}…, ${img.status}`);
}

async function images(connection: Connection) {
    const list = await connection.getRepository(FirmwareImage).query().findMany();
    for (const i of list.sort((x, y) => y.versionCode - x.versionCode)) {
        console.log(`${i._id}  ${i.version}+${i.buildNumber}  ${i.size} B  ${i.status}  ${i.uploadedAt.toISOString()}  ${i.note}`);
    }
}

async function createJob(connection: Connection, a: Record<string, string>) {
    if (!a.device || !a.image) throw new Error("--device and --image are required");
    const device = await findDevice(connection, a.device);
    if (device.deviceClass === 4) throw new Error("class 4 devices skip the CMAC, no firmware update");
    const img = await connection.getRepository(FirmwareImage).findOne(a.image);
    if (!img) throw new Error(`image ${a.image} not found`);
    const force = a.force === "true";
    if (img.status !== "RELEASED" && !force) throw new Error(`image is ${img.status}, pass --force for a test unit`);
    const chunkSize = a.chunk ? Number(a.chunk) : CHUNK_SIZE_DEFAULT;
    if (chunkSize % 4 !== 0 || chunkSize <= 0 || chunkSize > CHUNK_SIZE_MAX) throw new Error(`chunk size must be a multiple of 4, at most ${CHUNK_SIZE_MAX}`);

    const df = await connection.getRepository(DeviceFirmware).findOne(device._id);
    if (!df) throw new Error("device has not reported its firmware yet (packetType 2): no OTA-capable firmware");
    if (df.bootloaderVersion < Math.max(1, img.minBlVersion)) throw new Error(`device bootloader OTA level ${df.bootloaderVersion}, image needs ${img.minBlVersion}`);
    if (df.reportedVersion === img.version && df.reportedBuild === img.buildNumber && !force) throw new Error("device already runs this version");

    const jobRepo = connection.getRepository(FwUpdateJob);
    const dfRepo = connection.getRepository(DeviceFirmware);
    // Datastore allows only ancestor queries inside a transaction, so the
    // active-job check runs before it; the job sequence is still taken in it
    const jobs = await jobRepo.query().filter("deviceId", device._id).findMany();
    const active = jobs.find(j => ACTIVE_JOB_STATES.includes(j.state));
    if (active) throw new Error(`job ${active._id} (seq ${active.jobSeq}) is ${active.state}; cancel it first`);
    const result = await connection.getTransactionManager({ maxRetry: 2 }).start(async session => {
        const fresh = (await dfRepo.findOneWithSession(device._id, session))!;
        fresh.lastJobSeq = (fresh.lastJobSeq + 1) & 0xffff || 1;
        dfRepo.updateWithSession(fresh, session);

        const [id] = await jobRepo.allocateIdsWithSession(1, session);
        const job = new FwUpdateJob();
        job._id = id;
        job.deviceId = device._id;
        job.jobSeq = fresh.lastJobSeq;
        job.imageId = img._id;
        job.fromVersion = `${df.reportedVersion}+${df.reportedBuild}`;
        job.targetVersion = img.version;
        job.targetBuild = img.buildNumber;
        job.targetVersionCode = img.versionCode;
        job.state = "CREATED";
        job.chunkSize = chunkSize;
        job.chunksTotal = Math.ceil(img.size / chunkSize);
        job.createdAt = new Date();
        job.createdBy = "fw-bench";
        job.lastActivityAt = new Date();
        job.expiresAt = new Date(Date.now() + (a.days ? Number(a.days) : 14) * 86400_000);
        jobRepo.insertWithSession(job, session);
        return job;
    });
    const job = result.value;
    console.log(`job ${job._id} seq ${job.jobSeq} for ${device.name}: ${job.fromVersion} -> ${img.version}+${img.buildNumber}, ${job.chunksTotal} chunks of ${chunkSize} B`);
    console.log("The scale picks it up on its next downlink request (first transmit after boot, then every 24 h).");
}

async function status(connection: Connection, a: Record<string, string>) {
    if (!a.device) throw new Error("--device is required");
    const device = await findDevice(connection, a.device);
    const df = await connection.getRepository(DeviceFirmware).findOne(device._id);
    console.log(`${device.name} (${device._id}, ${device.address})`);
    console.log(df ? `  runs ${df.reportedVersion}+${df.reportedBuild}, bootloader level ${df.bootloaderVersion}, reported ${df.reportedAt.toISOString()}, last job seq ${df.lastJobSeq}` : "  no firmware report yet");
    const jobs = await connection.getRepository(FwUpdateJob).query().filter("deviceId", device._id).findMany();
    for (const j of jobs.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
        console.log(`  job ${j._id} seq ${j.jobSeq}: ${j.state}  ${j.fromVersion} -> ${j.targetVersion}+${j.targetBuild}  chunk ${j.nextChunk}/${j.chunksTotal}  attempt ${j.attempt}  deferrals ${j.deferrals}  ${j.lastError}  last ${j.lastActivityAt.toISOString()}`);
    }
}

async function cancel(connection: Connection, a: Record<string, string>) {
    if (!a.device) throw new Error("--device is required");
    const device = await findDevice(connection, a.device);
    const repo = connection.getRepository(FwUpdateJob);
    const jobs = await repo.query().filter("deviceId", device._id).findMany();
    const active = jobs.find(j => ACTIVE_JOB_STATES.includes(j.state));
    if (!active) { console.log("no active job"); return; }
    const result = await connection.getTransactionManager({ maxRetry: 2 }).start(async session => {
        const fresh = await repo.findOneWithSession(active._id, session);
        if (!fresh || !ACTIVE_JOB_STATES.includes(fresh.state)) { await session.rollback(); return undefined; }
        fresh.state = "CANCELLED";
        fresh.finishedAt = new Date();
        fresh.lastActivityAt = new Date();
        repo.updateWithSession(fresh, session);
        return fresh;
    });
    console.log(result.value ? `job ${active._id} cancelled; the scale gets FW_ABORT on its next request` : "job finished meanwhile, nothing cancelled");
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const a = args(rest);
    const keyFilename = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (!keyFilename) throw new Error("set GOOGLE_SERVICE_ACCOUNT to the Datastore service account file");
    const connection = createConnection({ keyFilename });
    switch (command) {
        case "upload": return upload(connection, a);
        case "images": return images(connection);
        case "job": return createJob(connection, a);
        case "status": return status(connection, a);
        case "cancel": return cancel(connection, a);
        default:
            console.log("commands: upload, images, job, status, cancel (see the header of scripts/fw-bench.ts)");
    }
}

if (require.main === module) {
    main().catch(e => { console.error(e.message ?? e); process.exit(1); });
}
