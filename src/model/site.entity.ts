import { Key } from "@google-cloud/datastore";
import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity({enumerable: true})
export class Site extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field()
    public name: string;
    @Field()
    public devices: Key[];
}