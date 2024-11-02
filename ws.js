const WebSocketServer = require('ws');
const { createClient } = require("redis");
const connectToMongo = require("./db");
const Message = require("./Message.js")

connectToMongo()

const client = createClient();
client.on('error', err => console.log('Redis Client Error', err));
client.on('connect', () => {console.log("Connected to Redis")})
client.connect();

const wss = new WebSocketServer.Server({ port: 8080, host:"0.0.0.0" })

let clients = []
let userNames = []

wss.on("connection", (ws) => {
    console.log("new client connected");
    clients.push(ws)
    ws.on("message", async (data) => {
        console.log(`Client has sent us data`)
        let info = JSON.parse(`${data}`)
        console.log(info)
        let user = await client.hGetAll(info.token)
        userNames[clients.indexOf(ws)] = user.userName
        if (info.type === "handshake") {
            let messages = await Message.find({$or:[{to: user.userName, from:info.to}, {to: info.to, from:user.userName}]})
            let outcome = {type: "handshake", result:[]}
            let result = []
            for (let i = 0; i < messages.length; i++) {
                if (messages[i].from === user.userName) {
                    result.push({who: "me", message: messages[i].message})
                }
                else {
                    result.push({who: "them", message: messages[i].message})
                }
            }
            outcome.result = result
            ws.send(JSON.stringify(outcome))
        }
        if (info.type !== "message") return;
        if (userNames.indexOf(info.to) !== -1) {
            console.log("Sending")
            clients[userNames.indexOf(info.to)].send(`{"message": "${info.message}", "from":"${user.userName}", "type": "message"}`)
        }
        console.log("from: " + user.userName)
        console.log("to: " + info.to)
        if (!info.message || info.message.length === 0) return;
        Message.create({from: user.userName, to: info.to, time: JSON.stringify(Date.now()), message: info.message})
    });
    ws.on("close", () => {
        console.log("the client has disconnected");
        userNames.splice(clients.indexOf(ws), 1);
        clients.splice(clients.indexOf(ws), 1);
    });

    ws.onerror = function () {
        console.log("Some Error occurred")
    }
});
console.log("The WebSocket server is running on port 8080");