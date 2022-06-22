import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity({enumerable: true})
export class Day extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field({index: true})
    public day: number;
}