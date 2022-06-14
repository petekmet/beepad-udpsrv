import { downlinkSetSensorPacket } from "../utils/structbuffer";
import { downlinkPacketHeader } from "../utils/structbuffer";
import { Request, Response } from "express";


export async function sendMessageToDevice(req: Request, res: Response) {   
    const header = downlinkPacketHeader.encode({
        deviceId: 0,
        subscriberId: 0,
        packetType: 1,
        packetLength: 6,
    });
    const data = req.params.data ? Buffer.from(req.params.data): Buffer.from("000000000000");
    const payload = downlinkSetSensorPacket.encode({
        sensorDeviceId: new Uint8Array(data)
    });
    const outMessage = Buffer.concat([Buffer.from(header.buffer), Buffer.from(payload.buffer)]);
    res.send(outMessage.toString("hex"));
}