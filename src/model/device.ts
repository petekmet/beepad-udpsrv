import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity()
export class Device extends BaseEntity {
    @Field({generateId: true})
    public _id: number = 0;

    @Field()
    public address: string;

    @Field()
    public name: string;

    @Field()
    public nwkSKey: string;

    @Field()
    public downlinkData: string;
}
