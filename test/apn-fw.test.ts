// Wiring of the firmware update into the uplink path (apn-service), with
// Datastore replaced: the FW store by a map, measurement saving by a spy.
import { AesCmac } from "aes-cmac";
import { Device } from "../src/model/device";
import { FirmwareImage } from "../src/model/firmware-image.entity";
import { FwUpdateJob } from "../src/model/fw-update-job.entity";
import { uplinkPacketHeader } from "../src/utils/structbuffer";

const saved: { downlinkDataSent: boolean }[] = [];
jest.mock("../src/service/measurement-service", () => {
    const actual = jest.requireActual("../src/service/measurement-service");
    return {
        ...actual,
        saveMeasurementForDevice: (_c: unknown, _d: unknown, _m: unknown, downlinkDataSent: boolean) => { saved.push({ downlinkDataSent }); },
    };
});
jest.mock("../src/service/email-service", () => ({ processEmailAlerts: async () => undefined }));

const memory: { job?: FwUpdateJob; image?: FirmwareImage; versions: unknown[] } = { versions: [] };
jest.mock("../src/fw/fw-store", () => ({
    DatastoreFwStore: class {
        async findJob() { return memory.job; }
        async findActiveJob() { return memory.job && ["CREATED", "OFFERED", "DOWNLOADING", "DOWNLOADED"].includes(memory.job.state) ? memory.job : undefined; }
        async updateJob(job: FwUpdateJob) { memory.job = job; return true; }
        async findImage() { return memory.image; }
        async findDeviceFirmware() { return undefined; }
        async saveDeviceFirmware(df: unknown) { memory.versions.push(df); }
    },
}));

import { processUplinkData } from "../src/service/apn-service";
import { resetFwCachesForTest } from "../src/fw/fw-service";

const KEY = "CB4E3EA400309DAB656D8DBFE4B93F35";
// header + payload of a real packetType 0 uplink (CMAC of the test data, not checked here)
const TYPE0 = Buffer.from("163b858bcf130300816dbddfd2330300001478b899627b003ce3039d0000000000000000e4100100000000000000000000000018e52d8a78", "hex");

function withFlags(payload: Buffer, downlinkRequest: boolean): Buffer {
    const p = Buffer.from(payload);
    p[34] = downlinkRequest ? (p[34] | 0x08) : (p[34] & ~0x08); // flags byte, bit 3
    return p;
}

function type2(downlinkRequest: boolean, bl = 1): { header: Buffer; payload: Buffer } {
    const header = Buffer.from(TYPE0.subarray(0, 17)); header[16] = 2;
    const p0 = withFlags(TYPE0.subarray(17), downlinkRequest);
    const payload = Buffer.concat([p0.subarray(0, 35), Buffer.from([1, 8, 8, 128, 0, bl]), p0.subarray(35)]);
    return { header, payload };
}

function device(): Device {
    const d = new Device();
    d._id = 42; d.address = TYPE0.subarray(0, 16).toString("hex"); d.name = "bench"; d.deviceClass = 2;
    d.nwkSKey = KEY; d.zeroWeight = 0;
    return d;
}

function setJob(state: FwUpdateJob["state"]) {
    const img = new FirmwareImage();
    img._id = "img"; img.size = 600; img.binary = Buffer.alloc(600, 0x5a); img.initPacket = Buffer.alloc(116, 1); img.status = "DRAFT";
    const job = new FwUpdateJob();
    job._id = 1; job.deviceId = 42; job.jobSeq = 3; job.imageId = "img"; job.state = state;
    job.targetVersion = "1.8.9"; job.targetBuild = 140; job.chunkSize = 256; job.chunksTotal = 3;
    job.expiresAt = new Date(Date.now() + 86400_000);
    memory.job = job; memory.image = img;
}

function checkMac(reply: Buffer) {
    const mac = new AesCmac(Buffer.from(KEY, "hex")).calculate(reply.subarray(0, reply.length - 4));
    expect(reply.subarray(reply.length - 4).equals(Buffer.from(mac.subarray(0, 4)))).toBe(true);
}

beforeEach(() => { saved.length = 0; memory.job = undefined; memory.image = undefined; memory.versions = []; resetFwCachesForTest(); });

describe("apn-service with firmware update", () => {
    test("packetType 2 without a job: measurement saved, version stored, queued downlinkData sent", async () => {
        const { header, payload } = type2(true);
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        const reply = await processUplinkData({} as any, device(), h, payload, "t", Buffer.from("0aabbcc", "hex"));
        expect(saved).toEqual([{ downlinkDataSent: true }]);
        expect(memory.versions.length).toBe(1);
        expect(reply![16]).toBe(0x0a); // downlink type from downlinkData
        checkMac(reply!);
    });

    test("a pending offer goes ahead of downlinkData, which stays queued", async () => {
        setJob("CREATED");
        const { header, payload } = type2(true);
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        const reply = (await processUplinkData({} as any, device(), h, payload, "t", Buffer.from("0aabbcc", "hex")))!;
        expect(reply[16]).toBe(0x10); // FW_OFFER
        expect(reply.readUInt16LE(17)).toBe(1 + 14 + 116 - 1); // packetLength = body without the type byte
        expect(saved).toEqual([{ downlinkDataSent: false }]);
        expect(memory.job!.state).toBe("OFFERED");
        checkMac(reply);
    });

    test("no downlink request: no offer, nothing sent", async () => {
        setJob("CREATED");
        const { header, payload } = type2(false);
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        expect(await processUplinkData({} as any, device(), h, payload, "t")).toBeUndefined();
        expect(memory.job!.state).toBe("CREATED");
    });

    test("packetType 1 chunk request is answered with the chunk", async () => {
        setJob("DOWNLOADING");
        const header = Buffer.from(TYPE0.subarray(0, 17)); header[16] = 1;
        const body = Buffer.from([0x10, 3, 0, 2, 0]); // FW_CHUNK_REQ job 3 chunk 2
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        const reply = (await processUplinkData({} as any, device(), h, Buffer.concat([body, Buffer.alloc(4)]), "t"))!;
        expect(reply[16]).toBe(0x11);
        expect(reply.readUInt16LE(17)).toBe(4 + 600 - 512);
        expect(reply.subarray(19, 23).equals(Buffer.from([3, 0, 2, 0]))).toBe(true);
        expect(reply.length).toBe(19 + 4 + 88 + 4);
        expect(saved.length).toBe(0);
        checkMac(reply);
    });

    test("packetType 0 (old firmware) still works and is never offered", async () => {
        setJob("CREATED");
        const p = withFlags(TYPE0.subarray(17), true);
        const h = uplinkPacketHeader.decode(new Uint8Array(TYPE0.subarray(0, 17)), true);
        const reply = await processUplinkData({} as any, device(), h, p, "t");
        expect(reply).toBeUndefined();
        expect(saved).toEqual([{ downlinkDataSent: true }]);
        expect(memory.job!.state).toBe("CREATED");
    });
});

describe("duplicate cnt after a reboot", () => {
    test("version is still reported and the offer still sent, the measurement is not saved", async () => {
        setJob("CREATED");
        const d = device();
        const { header, payload } = type2(true);
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        const cnt = payload[0];
        d.lastMeasurement = { cnt } as any; // the scale restarted its counter
        const reply = (await processUplinkData({} as any, d, h, payload, "t", Buffer.from("0aabbcc", "hex")))!;
        expect(saved.length).toBe(0);
        expect(memory.versions.length).toBe(1);
        expect(reply[16]).toBe(0x10); // FW_OFFER
        checkMac(reply);
    });

    test("duplicate without a job: nothing sent, as before", async () => {
        const d = device();
        const { header, payload } = type2(true);
        const h = uplinkPacketHeader.decode(new Uint8Array(header), true);
        d.lastMeasurement = { cnt: payload[0] } as any;
        expect(await processUplinkData({} as any, d, h, payload, "t", Buffer.from("0aabbcc", "hex"))).toBeUndefined();
        expect(saved.length).toBe(0);
        expect(memory.versions.length).toBe(1);
    });
});
