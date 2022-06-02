import { AesCmac } from "aes-cmac";
import express, { Express, Request, Response } from "express";
import { AddressInfo } from "net";
import { initDb } from "./utils/db";
import { downlinkPacketHeader, unixtime, uplinkPacket, uplinkPacketHeader } from "./utils/structbuffer";
const udp = require("dgram");

/*
uint64_t deviceId;      // 8 bytes, IMEI, max 18 446 744 073 709 551 615
    uint64_t subscriberId;  // 8 bytes, IMSI
    uint8_t packetType = 0; // 0 - uplink sensor data, 1 - service data, 2..255 - reserved
    uint8_t sequenceId;
    int16_t temperature;    // in 1/10 of degree Celsius
    uint8_t humidity;       // in %
    uint16_t pressure;      // in 1/10 of hPa
    int8_t signalStrength; // in dBm
    int16_t weight0;        // in 1/100kg max +/- 327.67kg
    int16_t weight1;
    int16_t weight2;
    int16_t weight3;
    batterySocPacket_t batterySoc;
    extSensorPacket_t extSensor;
    bool alert: 1;
    bool restart : 1;
    bool shutdown : 1;
    bool downlinkRequest : 1;
    uint8_t reserved : 4;
    uint32_t cmic; 
*/
async function healthMethod(req: Request, res: Response) {
    res.send("OK3");
}

const webserver: Express = express();
webserver.route("/health").get(healthMethod);

const socket = udp.createSocket("udp4");
// emits on new datagram msg
socket.on('message', function (msg: Buffer, info: AddressInfo) {
    console.log("Inbound message on %s", new Date());
    console.log("Received %d bytes from %s:%d", msg.length, info.address, info.port);
    console.log("Data:", msg.toString("hex"));
    // verify cmac
    // extract device address
    // extract packet type
    // extract cmac
    // calculate cmac
    // decode header
    // const packet = uplinkPacket.decode(msg, true);
    const packetHeader = uplinkPacketHeader.decode(msg, true);
    console.log("Decoded packet header:", packetHeader);
    // verify cmac
    const cmac = msg.subarray(msg.length-4); // Buffer.from("2cc95bb0", "hex");
    const cmacNumber = cmac.readInt32LE();
    const aesCmac = new AesCmac(key);
    const result = aesCmac.calculate(msg.subarray(0,msg.length-4));
    const calculatedCmacNumber: number = result.subarray(0,4).readInt32LE();
    if(calculatedCmacNumber == cmacNumber) {
        console.log("Cmac ok");
    }else{
        console.log("Cmac verification failed");
    }

    if(packetHeader.packetType === 0){
        const packet = uplinkPacket.decode(new Uint8Array(msg.subarray(17)), true);
        console.log("Decoded packet type 0 (uplink packet):\n", packet);
        console.log("Measurement on", new Date(packet.measurementTimestamp*1000));
        if (packet.flags.downlinkRequest) {
            // create downlink packet when available or return current time
            const header = downlinkPacketHeader.encode({
                deviceId: packetHeader.deviceId,
                subscriberId: packetHeader.subscriberId,
                packetType: 0,
                packetLength: 4,
            });
            const payload = unixtime.encode({ timestamp: Math.trunc(Date.now() / 1000) });
            const outMessage = Buffer.concat([Buffer.from(header.buffer), Buffer.from(payload.buffer)]);
            socket.send(outMessage, info.port, info.address);
            console.log("Sent out response messages %s\n", outMessage.toString("hex"));
    
        } else {
            console.log("No downlink requested");
        }
    }
});

//emits when socket is ready and listening for datagram msgs
socket.on('listening', function () {
    var address = socket.address();
    var port = address.port;
    var family = address.family;
    var ipaddr = address.address;
    console.log('Server is listening at port ' + port);
    console.log('Server ip :' + ipaddr);
    console.log('Server is IP4/IP6 : ' + family);
});

//emits after the socket is closed using socket.close();
socket.on('close', function () {
    console.log('Socket is closed');
});

initDb();
socket.bind(2222);
console.log("UDP server started, v1.7.5");
webserver.listen(8080, () => {
    console.log("Web server is ⚡️running on 8080");
});

export default socket;

const key = Buffer.from("CB4E3EA400309DAB656D8DBFE4B93F35", "hex");