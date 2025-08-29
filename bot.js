const fs = require("fs");
const login = require("facebook-chat-api");
const config = require("./config.json");

// Load appstate.json
const appState = JSON.parse(fs.readFileSync("appstate.json", "utf8"));

let groupLocks = {}; // { threadID: "Locked Group Name" }

login({ appState }, (err, api) => {
  if (err) return console.error("Login error:", err);

  console.log("✅ Bot logged in and running...");

  api.listenMqtt((err, message) => {
    if (err) return console.error(err);

    if (message.type === "message" && message.body) {
      const body = message.body.trim();
      const sender = message.senderID;
      const threadID = message.threadID;

      // ---- PREFIX COMMANDS ----
      if (body.startsWith(config.prefix)) {
        const args = body.slice(config.prefix.length).split(" ");
        const cmd = args[0].toLowerCase();

        // ✅ Lock Group Name
        if (cmd === "lockname" && sender === config.admin) {
          api.getThreadInfo(threadID, (err, info) => {
            if (e
