import express, { Express, Request, Response } from "express";
import { startUdpServer } from "./apn-server";
import { initDb, initMongoose } from "./utils/db";

async function healthMethod(req: Request, res: Response) {
    res.send("OK3");
}

const webserver: Express = express();
webserver.route("/health").get(healthMethod);
// webserver.route("/devmsg").get(sendMessageToDevice);

initDb();
initMongoose();

// TODO: extract to a separate file
webserver.listen(8080, () => {
    console.log("Web server is ⚡️running on 8080");
});

startUdpServer();
console.log("udpsrv started, v1.9.7, at", new Date());
