import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity()
export class NbiotDevice extends BaseEntity {
    @Field({generateId: true})
    public _id: number = 0;
    @Field()
    public deviceId: number;
    @Field()
    public imei: number = 0;
    @Field()
    public imsi: number = 0;
    @Field()
    public ipAddress: string;
    @Field()
    public port: number;
}