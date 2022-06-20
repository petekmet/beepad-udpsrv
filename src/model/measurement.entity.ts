import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity()
export class Measurement extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
} 