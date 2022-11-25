import { Socket } from "node:dgram";
import dgram from "dgram";
import { AddressInfo } from "net";
import { apnServiceGetResponseBuffer } from "./service/apn-service";

const server: Socket = dgram.createSocket("udp4");
const key = Buffer.from("CB4E3EA400309DAB656D8DBFE4B93F35", "hex");

export function startUdpServer(){
    // emits on new datagram msg
    server.on('message', async function (msg: Buffer, info: AddressInfo) {
        console.log("\nInbound message on %s", new Date());
        console.log("Received %d bytes from %s:%d", msg.length, info.address, info.port);
        console.log("Data:", msg.toString("hex"));
        const responseBuffer = await apnServiceGetResponseBuffer(msg, info);
        if(responseBuffer){
            server.send(responseBuffer, info.port, info.address);
            console.log("Sent out response messages %s\n", responseBuffer.toString("hex"));
        }else{
            console.log("No data sent out");
        }
    });

    //emits when socket is ready and listening for datagram msgs
    server.on('listening', function () {
        var address = server.address();
        var port = address.port;
        var family = address.family;
        var ipaddr = address.address;
        console.log('Server is listening at port ' + port);
        console.log('Server ip :' + ipaddr);
        console.log('Server is IP4/IP6 : ' + family);
    });

    //emits after the socket is closed using socket.close();
    server.on('close', function () {
        console.log('Socket is closed');
    });

    server.bind(2222);
}
