// Original webpack modules: 57237 (LinuxSocketPipe), 55096 (LoraClient)
//
// This is the boundary between this Node.js app and the actual radio
// hardware. Neither class here talks to SPI/GPIO directly - instead they
// speak a small JSON-RPC-ish protocol over a Unix domain socket
// (/var/run/lora_radio.sock by default, see config.js) to a separate,
// not-part-of-this-bundle driver process, which is the thing that
// actually owns the SX126x-family radio (confirmed by this file's own log
// message: "Connected to the SX126X module"). That driver process wasn't
// part of the JS payload extracted for this analysis - it's presumably a
// native binary elsewhere in the firmware image.

const { getLoraDriverConfig } = require("./config");
const { MessageQueueClient } = require("./message-queue-client"); // original module 48409, not yet transcribed - see README

// Base class (original module 48409's MessagePipe/MessageQueueClient, not
// yet transcribed - see README) is assumed to define sendMessage() and an
// onMessage-style event hook that subclasses wire up.

class LinuxSocketPipe {
  path;
  #socket;
  onMessage;

  constructor(path) {
    this.path = path;
  }

  isRunning() {
    return true;
  }

  // `path` doubles as either "host:port" (2 colon-separated parts -> plain
  // TCP) or a filesystem path (-> Unix domain socket). Waits up to 3
  // seconds for the socket file to appear before giving up.
  async #createSocket() {
    const net = require("net");
    const parts = this.path.split(":");
    if (parts.length === 2) {
      return net.connect({ host: parts[0], port: parseInt(parts[1]) });
    }
    await this.#waitForSocketFile(this.path);
    return net.createConnection({ path: this.path });
  }

  #waitForSocketFile(path) {
    const fs = require("fs");
    let attemptsRemaining = 3;
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (fs.existsSync(path)) {
          clearInterval(interval);
          resolve();
        } else if (--attemptsRemaining <= 0) {
          clearInterval(interval);
          reject(new Error("Lora Driver Not Work"));
        }
      }, 1000);
    });
  }

  async start() {
    if (this.#socket != null) {
      this.#socket.removeAllListeners();
      this.#socket.destroySoon();
      this.#socket = undefined;
    }
    this.#socket = await this.#createSocket();
    this.#socket.once("connect", () => logger.info("Connected to the SX126X module"));
    this.#socket.on("data", (data) => {
      if (this.onMessage != null) this.onMessage(data);
    });
    this.#socket.on("end", () => logger.info("Connection of sx126x end"));
    this.#socket.once("close", () => {
      logger.error("lora module closed");
      this.#socket?.destroy();
      this.#socket = undefined;
      // Auto-reconnect, unconditionally, after 1s.
      setTimeout(() => {
        console.log("Reconnecting to sx126x");
        this.start();
      }, 1000);
    });
    this.#socket.on("error", (err) => logger.error("lora module connection error", err));
  }

  sendMessage(data) {
    this.#socket?.write(data);
  }

  bindOnMessageEvent(onMessage) {
    this.onMessage = onMessage;
  }
}

// JSON-RPC-style client over a LinuxSocketPipe (or any MessageQueueClient
// transport). Two message shapes come back over the wire: LoRaWAN uplinks
// (identified by having both `rxInfo` and `phyPayload` fields - ChirpStack
// gateway-bridge's own uplink JSON shape) and RPC-style responses/events
// keyed by `method`.
class LoraClient extends MessageQueueClient {
  #callbacks = {};
  onLoraMessage;
  onKeyEvent;

  constructor(transport) {
    super(transport); // MessageQueueClient base handles the actual send/receive plumbing
  }

  setOnLoraMessage(fn) { this.onLoraMessage = fn; }
  setOnKeyEvent(fn) { this.onKeyEvent = fn; }

  onMessage(raw) {
    try {
      const msg = JSON.parse(raw);
      if (msg.hasOwnProperty("rxInfo") && msg.hasOwnProperty("phyPayload")) {
        this.#onLoraMessage(msg);
      } else if (msg.hasOwnProperty("method")) {
        if (this.#callbacks[msg.method] != null) {
          this.#callbacks[msg.method](msg.data);
        } else if (msg.method === "KeyEvent") {
          if (this.onKeyEvent != null) this.onKeyEvent(msg.data);
        } else if (msg.method === "AteMode") {
          // Factory/production test mode flag - surfaced via a shared
          // app-context attribute rather than a callback.
          require("./app-context-attrs").AppCtxAttrs.ateMode.set(true); // original module 3721
        }
      }
    } catch (err) {
      console.error(err);
      logger.error(`Not a valid JSON string: [${raw}] with error ${err}`);
    }
  }

  // One-shot request/response over the socket, 6s timeout.
  callMethod(method, params) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (this.#callbacks[method] != null) {
          delete this.#callbacks[method];
          reject("Timeout");
        }
      }, 6000);
      this.#callbacks[method] = (result) => {
        clearTimeout(timeoutHandle);
        resolve(result);
        delete this.#callbacks[method];
      };
      this.sendMessage(JSON.stringify({ method, params }));
    });
  }

  setLoraConfig(config) { return this.callMethod("setLoraConfig", config).then((r) => r === 1); }
  getLoraConfig() { return this.callMethod("getLoraConfig", {}); }
  sendLoraDownlink(payload) { return this.callMethod("downlink", payload).then((r) => r === 1); }
  getGeneralState() { return this.callMethod("getGeneralState", {}); }
  broadcastId() { return this.callMethod("broadcastId", {}); }

  #onLoraMessage(msg) {
    Buffer.from(msg.phyPayload, "base64"); // decoded but (in this code path) discarded - not fully understood, see README
    if (this.onLoraMessage != null) this.onLoraMessage(msg);
  }

  // Singleton, stashed on the app-wide DI context (see app.js) once the
  // socket connection is established (see task-registrations/connect-lora-module.js).
  static of() {
    return app.getContext("__lora_module");
  }
  static registerWith(transport) {
    const client = new LoraClient(transport);
    app.setContext("__lora_module", client);
    return client;
  }
}

module.exports = { LinuxSocketPipe, LoraClient };
