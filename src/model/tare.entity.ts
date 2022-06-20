import { BaseEntity, Entity, Field } from "ts-datastore-orm";
import { Measurement } from "./measurement.entity";

/*
 extends BaseEntity
 {
            timestamp: 2022-06-13T15:29:59.533Z,
            measurementEntity: null,
            isDefault: false,
            offset: 604800,
            hourCorrection: null,
            difference: null,
            name: 'Před týdnem',
            note: null
          }
*/
// @Entity()
export class Tare {
    // @Field({generateId: true})
    public timestamp: Date;
    public measurementEntity: Measurement;
    public isDefault: boolean;
    public offset: number;
    public hourCorrection: number;
    public difference: number;
    public name: string;
    public note: string;
}