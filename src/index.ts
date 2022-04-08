import { AddressInfo } from "net";

const udp = require("dgram");

type User = {
    name: string;
    age: number;
};

const socket = udp.createSocket("udp4");
// emits on new datagram msg
socket.on('message',function(msg: Buffer, info: AddressInfo){
    console.log('Data received from client : ' + msg.toString("hex"));
    console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
    var outMessage = Buffer.from('Hello from AZURE server! '+new Date().toLocaleString());
    socket.send(outMessage, info.port, info.address);
    console.log("sent message %s", outMessage.toString("hex"));
});

//emits when socket is ready and listening for datagram msgs
socket.on('listening',function(){
    var address = socket.address();
    var port = address.port;
    var family = address.family;
    var ipaddr = address.address;
    console.log('Server is listening at port ' + port);
    console.log('Server ip :' + ipaddr);
    console.log('Server is IP4/IP6 : ' + family);
});

//emits after the socket is closed using socket.close();
socket.on('close',function(){
    console.log('Socket is closed');
});

socket.bind(2222);
console.log("UDP server started");
