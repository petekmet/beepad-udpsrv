import { Connection } from "ts-datastore-orm";
import { DeviceFirmware } from "../model/device-firmware.entity";
import { FirmwareImage } from "../model/firmware-image.entity";
import { ACTIVE_JOB_STATES, FwJobState, FwUpdateJob } from "../model/fw-update-job.entity";

// Storage the firmware update logic needs. Datastore in production, a map in
// tests (test/fw-service.test.ts).
export interface FwStore {
    findJob(deviceId: number, jobSeq: number): Promise<FwUpdateJob | undefined>;
    findActiveJob(deviceId: number): Promise<FwUpdateJob | undefined>;
    /** Write the job only if its stored state is still expectedState (admin-api may have cancelled it). */
    updateJob(job: FwUpdateJob, expectedState: FwJobState): Promise<boolean>;
    findImage(imageId: string): Promise<FirmwareImage | undefined>;
    findDeviceFirmware(deviceId: number): Promise<DeviceFirmware | undefined>;
    saveDeviceFirmware(df: DeviceFirmware): Promise<void>;
}

export class DatastoreFwStore implements FwStore {
    constructor(private readonly connection: Connection) {}

    async findJob(deviceId: number, jobSeq: number): Promise<FwUpdateJob | undefined> {
        // equality filters only: served by the built-in indexes, no composite index needed
        const jobs = await this.connection.getRepository(FwUpdateJob).query()
            .filter("deviceId", deviceId).filter("jobSeq", jobSeq).findMany();
        // jobSeq is unique per device; if it ever is not, prefer the active one, then the newest
        return pickJob(jobs);
    }

    async findActiveJob(deviceId: number): Promise<FwUpdateJob | undefined> {
        const jobs = await this.connection.getRepository(FwUpdateJob).query()
            .filter("deviceId", deviceId).findMany();
        return pickJob(jobs.filter(j => ACTIVE_JOB_STATES.includes(j.state)));
    }

    async updateJob(job: FwUpdateJob, expectedState: FwJobState): Promise<boolean> {
        const repo = this.connection.getRepository(FwUpdateJob);
        const result = await this.connection.getTransactionManager({ maxRetry: 2 }).start(async session => {
            const fresh = await repo.findOneWithSession(job._id, session);
            if (!fresh || fresh.state !== expectedState) {
                await session.rollback();
                return false;
            }
            repo.updateWithSession(job, session);
            return true;
        });
        return result.value === true && result.hasCommitted;
    }

    async findImage(imageId: string): Promise<FirmwareImage | undefined> {
        return this.connection.getRepository(FirmwareImage).findOne(imageId);
    }

    async findDeviceFirmware(deviceId: number): Promise<DeviceFirmware | undefined> {
        return this.connection.getRepository(DeviceFirmware).findOne(deviceId);
    }

    async saveDeviceFirmware(df: DeviceFirmware): Promise<void> {
        // admin-api / the bench tool bump lastJobSeq in a transaction; keep theirs
        const repo = this.connection.getRepository(DeviceFirmware);
        await this.connection.getTransactionManager({ maxRetry: 2 }).start(async session => {
            const fresh = await repo.findOneWithSession(df._id, session);
            if (fresh) df.lastJobSeq = Math.max(df.lastJobSeq, fresh.lastJobSeq);
            repo.upsertWithSession(df, session);
        });
    }
}

function pickJob(jobs: FwUpdateJob[]): FwUpdateJob | undefined {
    if (jobs.length === 0) return undefined;
    return [...jobs].sort((a, b) => {
        const activeA = ACTIVE_JOB_STATES.includes(a.state) ? 1 : 0;
        const activeB = ACTIVE_JOB_STATES.includes(b.state) ? 1 : 0;
        if (activeA !== activeB) return activeB - activeA;
        return b.createdAt.getTime() - a.createdAt.getTime();
    })[0];
}
