import { BaseEntity, Entity, Field } from "ts-datastore-orm";

@Entity()
export class LogEmail extends BaseEntity  {
    @Field({generateId: true})
    public _id: number = 0;
    @Field()
    public templateId: string;
    @Field()
    public destination: string[];
    @Field()
    public content: string;
    @Field({index: true})
    public timestamp: Date;
}