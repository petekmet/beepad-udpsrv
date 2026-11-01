import { BaseEntity, Entity, Field } from "ts-datastore-orm";

// Health a device last reported in its packetType 3 trailer, keyed by the
// Device's numeric id. Own entity (like DeviceFirmware) so services that save
// the whole Device cannot drop it. udpsrv is the only writer. Written only
// when a value changes, so the counters show when a scale needed help.
@Entity()
export class DeviceHealth extends BaseEntity {
    @Field()
    public _id: number = 0; // Device._id

    @Field({ index: true })
    public lastResetCause: number = 0; // RESET_CAUSE_* of the boot the counters belong to

    @Field()
    public lastResetCauseName: string = "";

    @Field()
    public reattachAttempts: number = 0; // since that boot

    @Field()
    public reattachRecovered: number = 0;

    @Field()
    public failedSends: number = 0;

    @Field()
    public reportedAt: Date = new Date();
}
