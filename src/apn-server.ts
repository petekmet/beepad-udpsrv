import { Socket } from "node:dgram";
import dgram from "dgram";
import { AddressInfo } from "net";
import { apnServiceGetResponseBuffer } from "./service/apn-service";
import logger, { evt, newTrace } from "./utils/logger";
import { env } from "node:process";

const server: Socket = dgram.createSocket("udp4");

export function startUdpServer(){
    // emits on new datagram msg
    server.on('message', async function (msg: Buffer, info: AddressInfo) {
        // One correlation id per datagram, carried through the whole call chain
        // so every log line for this packet shares `trace`.
        const trace = newTrace();
        const ctx = { trace, srcIp: info.address };
        logger.info("Inbound message", evt("server", ctx));
        logger.info("Received %d bytes from %s:%d", msg.length, info.address, info.port, evt("server", ctx));
        logger.info("Data %s", msg.toString("hex"), evt("server", ctx));
        const responseBuffer = await apnServiceGetResponseBuffer(msg, info, trace);
        if(responseBuffer){
            server.send(responseBuffer, info.port, info.address);
            logger.info("Sent out response messages %s", responseBuffer.toString("hex"), evt("server", ctx));
        }else{
            logger.info("No data sent out", evt("server", ctx));
        }
    });

    //emits when socket is ready and listening for datagram msgs
    server.on('listening', function () {
        const address = server.address();
        logger.info(
            "udpsrv listening at %s:%d (%s)", address.address, address.port, address.family,
            evt("server", { hostname: env.HOSTNAME })
        );
    });

    //emits after the socket is closed using socket.close();
    server.on('close', function () {
        logger.debug('Socket is closed', evt("server"));
    });

    server.bind(2222);
}
