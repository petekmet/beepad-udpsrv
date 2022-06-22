import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity({enumerable: true})
export class Year extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field({index: true})
    public year: number;
}