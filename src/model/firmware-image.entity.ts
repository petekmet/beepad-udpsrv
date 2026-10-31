import { BaseEntity, Entity, Field } from "ts-datastore-orm";

// A firmware image an admin can roll out (design doc section 3.1). Written by
// admin-api (for now by scripts/fw-bench.ts), read by udpsrv. Immutable once
// uploaded: a fix is a new image.
@Entity()
export class FirmwareImage extends BaseEntity {
    @Field()
    public _id: string = "";

    @Field({ index: true })
    public deviceType: string = "NBIOT_SCALE";

    @Field({ index: true })
    public hwVersion: string = "";

    @Field({ index: true })
    public version: string = ""; // major.minor.patch

    @Field()
    public buildNumber: number = 0;

    @Field({ index: true })
    public versionCode: number = 0;

    @Field()
    public size: number = 0;

    @Field()
    public sha256: string = "";

    @Field()
    public initPacket: Buffer = Buffer.alloc(0); // signed .dat from the nrfutil package

    @Field()
    public binary: Buffer = Buffer.alloc(0);

    @Field()
    public minBlVersion: number = 1;

    @Field({ index: true })
    public status: string = "DRAFT"; // DRAFT, RELEASED, WITHDRAWN

    @Field()
    public note: string = "";

    @Field()
    public uploadedAt: Date = new Date();
}
