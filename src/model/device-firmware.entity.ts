import { BaseEntity, Entity, Field } from "ts-datastore-orm";

// Firmware a device last reported (design doc section 3.3), keyed by the
// Device's numeric id. Kept apart from Device because several services save
// the whole Device and would drop properties they do not know. udpsrv is the
// only writer of the reported* fields; whoever creates a job bumps lastJobSeq.
@Entity()
export class DeviceFirmware extends BaseEntity {
    @Field()
    public _id: number = 0; // Device._id

    @Field()
    public reportedVersion: string = "";

    @Field()
    public reportedBuild: number = 0;

    @Field({ index: true })
    public reportedVersionCode: number = 0;

    @Field()
    public bootloaderVersion: number = 0;

    @Field()
    public reportedAt: Date = new Date();

    @Field()
    public lastJobSeq: number = 0;
}
