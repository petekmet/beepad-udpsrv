import { BaseEntity, Entity, Field } from "ts-datastore-orm";

// Read-only view (from udpsrv's perspective) of the single "global" Settings
// entity owned/written by beepad-admin-api. Only the fields the ingestion path
// needs to *decide* when to notify are mapped (thresholds + toggles); template
// names + currency live entirely in admin-api and are not needed here.
@Entity()
export class Settings extends BaseEntity {
    @Field()
    public _id: string = "global";

    @Field()
    public batteryNotificationEnabled: boolean = false;

    @Field()
    public batteryLowThresholdMv: number = 3500;

    @Field()
    public batteryRestoreThresholdMv: number = 3800;

    @Field()
    public weightAlarmEnabled: boolean = false;

    @Field()
    public weightAlarmThresholdKg: number = 1;
}
