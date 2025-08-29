const fs = require("fs");
const login = require("@xaviabot/fb-chat-api");

// ---- Load config ----
const CONFIG_PATH = "./config.json";
const LOCKS_PATH = "./locks.json"; // per-thread settings persist
const APPSTATE_PATH = "./appstate.json";

if (!fs.existsSync(CONFIG_PATH)) {
  console.error("config.json missing!");
  process.exit(1);
}
if (!fs.existsSync(APPSTATE_PATH)) {
  console.error("appstate.json missing!");
  process.exit(1);
}

let config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
let locks = fs.existsSync(LOCKS_PATH) ? JSON.parse(fs.readFileSync(LOCKS_PATH, "utf8")) : {};

// helper: save locks
function saveLocks() {
  fs.writeFileSync(LOCKS_PATH, JSON.stringify(locks, null, 2));
}

// ensure thread record
function ensureThread(threadID) {
  if (!locks[threadID]) {
    locks[threadID] = {
      enabled: false,
      name: null,      // locked name
      lastEnforcer: null
    };
  }
  return locks[threadID];
}

function isAdmin(senderID) {
  return String(senderID) === String(config.adminId);
}

function isCommand(body) {
  return body && body.startsWith(config.prefix);
}

function parseCommand(body) {
  const noPrefix = body.slice(config.prefix.length).trim();
  const [cmd, ...rest] = noPrefix.split(/\s+/);
  return { cmd: (cmd || "").toLowerCase(), args: rest, fullArgs: noPrefix.slice((cmd || "").length).trim() };
}

login({ appState: JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8")) }, (err, api) => {
  if (err) {
    console.error("Login failed:", err);
    process.exit(1);
  }

  console.log("Bot logged in. Listening…");

  // less noisy
  api.setOptions({
    listenEvents: true,
    selfListen: false,
    updatePresence: false
  });

  // Core: enforce lock if thread name changes
  function enforceNameLock(event) {
    const threadID = event.threadID;
    const t = ensureThread(threadID);
    if (!t.enabled || !t.name) return;

    // revert name if changed
    api.setTitle(t.name, threadID, (e) => {
      if (e) {
        console.log(`Failed to reset name in ${threadID}:`, e.error || e);
      } else {
        t.lastEnforcer = Date.now();
        saveLocks();
        // Optional: notify thread (quiet)
        // api.sendMessage("🔒 Group name is locked. Reverting changes.", threadID);
      }
    });
  }

  // Message + Event listener
  api.listenMqtt((err, event) => {
    if (err) {
      console.error("Listen error:", err);
      return;
    }

    // 1) Commands (text messages)
    if (event.type === "message" && event.body) {
      const { threadID, senderID, body } = event;

      if (!isCommand(body)) return;

      // admin-only commands
      if (!isAdmin(senderID)) {
        return api.sendMessage("⛔ Sirf admin is bot ko control kar sakta hai.", threadID);
      }

      const { cmd, args, fullArgs } = parseCommand(body);

      // !lock on/off
      if (cmd === "lock") {
        const sub = (args[0] || "").toLowerCase();

        // !lock on
        if (sub === "on") {
          const t = ensureThread(threadID);
          // if no name set in config, capture current name
          api.getThreadInfo(threadID, (e, info) => {
            if (e) return api.sendMessage("Error: thread info fetch failed.", threadID);
            if (!t.name) t.name = info.threadName || "Group";
            t.enabled = true;
            saveLocks();
            api.sendMessage(`🔒 Name-lock ON\nLocked name: “${t.name}”`, threadID);
          });
          return;
        }

        // !lock off
        if (sub === "off") {
          const t = ensureThread(threadID);
          t.enabled = false;
          saveLocks();
          return api.sendMessage("🔓 Name-lock OFF", threadID);
        }

        // !lock set <name>
        if (sub === "set") {
          const newName = fullArgs.replace(/^set\s+/i, "").trim();
          if (!newName) {
            return api.sendMessage(`Use: ${config.prefix}lock set <name>`, threadID);
          }
          const t = ensureThread(threadID);
          t.name = newName;
          saveLocks();
          return api.sendMessage(`✅ Locked name set to: “${newName}”`, threadID);
        }

        // !lock status
        if (sub === "status") {
          const t = ensureThread(threadID);
          return api.sendMessage(
            `Status: ${t.enabled ? "ON" : "OFF"}\nLocked name: ${t.name ? `“${t.name}”` : "not set"}`,
            threadID
          );
        }

        // help
        return api.sendMessage(
          `Commands:
${config.prefix}lock on  — enable name-lock
${config.prefix}lock off — disable name-lock
${config.prefix}lock set <name> — set locked name
${config.prefix}lock status — show status`,
          threadID
        );
      }

      // optional: change prefix (admin)
      if (cmd === "setprefix") {
        const newP = (args[0] || "").trim();
        if (!newP) return api.sendMessage("Use: setprefix <symbol>", threadID);
        config.prefix = newP;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return api.sendMessage(`✅ Prefix updated to: ${newP}`, threadID);
      }

      // optional: ping
      if (cmd === "ping") {
        return api.sendMessage("pong", threadID);
      }
    }

    // 2) System events: catch group name change
    // facebook-chat-api emits log events like 'event' with logMessageType 'log:thread-name'
    if (event.type === "event" && event.logMessageType === "log:thread-name") {
      enforceNameLock(event);
    }
  });
});
