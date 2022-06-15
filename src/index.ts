import express, { Express, Request, Response } from "express";
import { startUdpServer } from "./apn-server";
import { initDb, initMongoose } from "./utils/db";

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
// webserver.route("/devmsg").get(sendMessageToDevice);

initDb();
initMongoose();

webserver.listen(8080, () => {
    console.log("Web server is ⚡️running on 8080");
});

startUdpServer();
console.log("udpsrv started, v1.8.2");