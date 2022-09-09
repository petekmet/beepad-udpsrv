import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity({enumerable: true})
export class Account extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field()
    public name: string;
    @Field()
    public email: string[];
}