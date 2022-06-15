import { prop } from "@typegoose/typegoose";
import { BaseEntity, Entity, Field } from "ts-datastore-orm";
import { MemoryMeasurement } from "vm";
import { Measurement } from "./measurement.entity";
import { Tare } from "./tare.entity";
/*
{ "id": 6401590107832320,
 "name": "NB001-SK-TEST1",
  "address": "163b858bcf130300606c8cded2330300",
   "calibrationIndex": 100, 
   "zeroWeight": 3.3, "openHour": 7, 
   "closeHour": 19,
"timeZone": "Europe/Prague", 
   "nwkSKey": "CB4E3EA400309DAB656D8DBFE4B93F35", 
   "beta0": 0, "beta1": 0, "oldBeta0": 0, "downlinkData": "01DEADBEEF00FF",
    "status": null, "tares": null, "lat": 0,
     "lon": 0, "deviceClass": 2,
      "onDuty": "2022-06-13T22:00:00.000+00:00",
       "offDuty": null,
        "lastMeasurement": null }
*/

export class NbiotDevice {
    @prop()
    public address: string;

    @prop()
    public name: string;

    @prop()
    public calibrationIndex: number;

    @prop()
    public zeroWeight: number;

    @prop()
    public openHour: number;

    @prop()
    public closeHour: number;

    @prop()
    public timeZone: string;

    @prop()
    public nwkSKey: string;

    @prop()
    public beta0?: number;

    @prop()
    public beta1?: number;

    @prop()
    public oldBeta0?: number;

    @prop()
    public downlinkData?: string;

    @prop()
    public status?: string;

    @prop({ type: () => Tare })
    public tares?: Tare[];

    @prop()
    public lat?: number;

    @prop()
    public lon?: number;
    
    @prop()
    public deviceClass: number;

    @prop()
    public onDuty: Date;

    @prop()
    public offDuty?: Date;

    @prop()
    public lastMeasurement?: Measurement;
}