import { BaseEntity, Entity, Field } from "ts-datastore-orm";

export type FwJobState =
    | "CREATED" | "OFFERED" | "DOWNLOADING" | "DOWNLOADED"   // active
    | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";     // final

export const ACTIVE_JOB_STATES: FwJobState[] = ["CREATED", "OFFERED", "DOWNLOADING", "DOWNLOADED"];

// One firmware update of one device (design doc section 3.2). Created and
// cancelled by admin-api (for now scripts/fw-bench.ts), advanced by udpsrv.
// At most one active job per device.
@Entity()
export class FwUpdateJob extends BaseEntity {
    @Field({ generateId: true })
    public _id: number = 0;

    @Field({ index: true })
    public deviceId: number = 0; // Device._id

    @Field({ index: true })
    public jobSeq: number = 0; // u16 sent over the air, unique per device

    @Field()
    public imageId: string = "";

    @Field()
    public fromVersion: string = "";

    @Field()
    public targetVersion: string = "";

    @Field()
    public targetBuild: number = 0;

    @Field()
    public targetVersionCode: number = 0;

    @Field({ index: true })
    public state: FwJobState = "CREATED";

    @Field()
    public chunkSize: number = 256;

    @Field()
    public chunksTotal: number = 0;

    @Field()
    public nextChunk: number = 0; // highest chunk served + 1 (written throttled)

    @Field()
    public attempt: number = 0; // full restarts after a verify failure

    @Field()
    public maxAttempts: number = 3;

    @Field()
    public deferrals: number = 0;

    @Field()
    public offersUnanswered: number = 0; // offers repeated while still OFFERED: the scale took none of them

    @Field()
    public lastError: string = "";

    @Field()
    public createdAt: Date = new Date();

    @Field()
    public createdBy: string = "";

    @Field()
    public offeredAt: Date | null = null;

    @Field({ index: true })
    public lastActivityAt: Date = new Date();

    @Field()
    public finishedAt: Date | null = null;

    @Field()
    public expiresAt: Date = new Date();

    @Field({ index: true })
    public rolloutId: string | null = null;
}
