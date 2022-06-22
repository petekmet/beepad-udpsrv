import { entity } from "@google-cloud/datastore/build/src/entity";
import { BaseEntity, Entity, Field } from "ts-datastore-orm";
import { ExtSensor } from "./ext-sensor.entity";

/*
@Entity(name = "Measurement")
data class Measurement(
    @Id
    val id: Key? = null,
    val timestamp: Date = Date.from(Instant.now()),
    val weight: Double? = null,
    val temperature: Double = 0.0,
    val pressure: Double = 0.0,
    val humidity: Int = 0,
    val battery: Int = 0,
    val batteryStatus: Int = 3,
    val alarm: Boolean = false,
    val cnt: Long? = 0,
    val note: String? = null,
    val reset: Boolean = false,
    val downlinkReq: Boolean = false,
    val rssi: Int = 0,
    val shutdown: Boolean = false,
    val ext: ExtSensor? = null
)
*/

@Entity({enumerable: true})
export class Measurement extends BaseEntity{
    @Field({generateId: true})
    public _id: number = 0;
    @Field({index: true})
    public timestamp: Date = new Date();
    @Field()
    public weight: number = 0;
    @Field()
    public temperature: number =0;
    @Field()
    public pressure: number = 0;
    @Field()
    public humidity: number = 0;
    @Field()
    public battery: number = 0;
    @Field()
    public batteryStatus: number = 3;
    @Field()
    public alarm: boolean = false;
    @Field()
    public cnt: number;
    @Field()
    public note: string;
    @Field()
    public reset: boolean = false;
    @Field()
    public downlinkReq: boolean;
    @Field()
    public rssi: number = 0;
    @Field()
    public shutdown: boolean;
    @Field()
    public ext?: ExtSensor;
} 