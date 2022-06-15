import { prop } from "@typegoose/typegoose";
import { BaseEntity, Entity, Field } from "ts-datastore-orm";
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
