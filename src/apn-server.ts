import { Socket } from "node:dgram";
import dgram from "dgram";
import { AddressInfo } from "net";
import { apnServiceGetResponseBuffer } from "./service/apn-service";
import logger from "./utils/logger";
import { env } from "node:process";

const server: Socket = dgram.createSocket("udp4");

export function startUdpServer(){
    // emits on new datagram msg
    server.on('message', async function (msg: Buffer, info: AddressInfo) {
        let labels = {labelse:{device: info.address}};
        logger.info("Inbound message", labels);
        logger.info("Received %d bytes from %s:%d", msg.length, info.address, info.port, labels);
        logger.info("Data %s", msg.toString("hex"), labels);
        const responseBuffer = await apnServiceGetResponseBuffer(msg, info);
        if(responseBuffer){
            server.send(responseBuffer, info.port, info.address);
            logger.info("Sent out response messages %s", responseBuffer.toString("hex"), labels);
        }else{
            logger.info("No data sent out", labels);
        }
    });

    //emits when socket is ready and listening for datagram msgs
    server.on('listening', function () {
        var address = server.address();
        var port = address.port;
        var family = address.family;
        var ipaddr = address.address;
        var labels = {labels:{hostname: env.HOSTNAME}};
        logger.info({message:'udpsrv, listening at port '+ port, labels:{hostname: env.HOSTNAME}});
        logger.info('Server ip: %s', ipaddr);
        logger.info('Server is IP4/IP6: %s', family);
    });

    //emits after the socket is closed using socket.close();
    server.on('close', function () {
        logger.debug('Socket is closed');
    });

    server.bind(2222);
}
