import { Key } from "@google-cloud/datastore";
import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity({enumerable: true})
export class Account extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field()
    public name: string;
    @Field()
    public email: string[];
    // Defensive mappings (this app reads but does not write Account today): kept so any
    // future save preserves values written by beepad-admin-api / bpng.
    @Field()
    public zipCode: string;
    @Field()
    public devicesList: Key[];
}