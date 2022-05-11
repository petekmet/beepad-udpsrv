import { AddressInfo } from "net";
import { uplinkPacket } from "./utils/structbuffer";

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



const socket = udp.createSocket("udp4");
// emits on new datagram msg
socket.on('message', function (msg: Buffer, info: AddressInfo) {
    console.log('Received packet: %d bytes from %s:%d', msg.length, info.address, info.port);
    console.log('Data: ' + msg.toString("hex"));

    const packet = uplinkPacket.decode(msg, true);
    console.log("decoded packet:\n", packet);

    if (packet.flags.downlinkRequest) {
        var outMessage = Buffer.from('Hello from AKS on ' + new Date().toLocaleString());
        socket.send(outMessage, info.port, info.address);
        console.log("Sent out response messages %s\n", outMessage.toString("hex"));
        // socket.send(outMessage, info.port, info.address);
        // console.log("Sent out response messages %s\n", outMessage.toString("hex"));
    } else {
        console.log("No downlink requested");
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

socket.bind(2222);
console.log("UDP server started, v1.7.2");

export default socket;