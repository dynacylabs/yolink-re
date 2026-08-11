// Original webpack module: 31350
//
// Runs an embedded MQTT broker (the "aedes" library, original require
// r(96533)) INSIDE this Node process - not a connection to an external
// broker. Everything else in the app that talks "MQTT" is actually
// talking to this in-process broker, which several other local processes
// on the hub also connect to (loraserver's MQTT integration, at minimum -
// see config.js / the "loraserver" entry in AUTH_TABLE below).
//
// *** SECURITY-RELEVANT FINDING - see README.md in this folder ***
// AUTH_TABLE contains real, static passwords. They're the same on every
// hub running this firmware build, because they're compiled into the
// bundle rather than generated per-device. Whether that matters depends
// entirely on whether this broker is reachable from outside the hub -
// see the README for what wasn't verified.

const net = require("net"); // original: r(41808)
const aedes = require("aedes"); // original: r(96533)

const AUTH_TABLE = {
  loraserver: { password: "c43af48c-0ade-6199-537a-a2df325564b0" },
  integration: { password: "5299b63f-b66d-031b-8d33-2faac732b9dd" },
  as: { password: "sub-c-2a6a8e14-301b-11e5-b3fa-02ee2ddab7fe" }, // "as" - likely "application server"
  yaochi: { password: "KttYC123456" }, // "yaochi" - the same name as the support-email localpart in errors.js
};

function authenticate(client, username, passwordBuffer, callback) {
  const isValid = username != null && AUTH_TABLE[username]?.password === passwordBuffer?.toString();
  callback(null, isValid);
}

function getLocalBroker() {
  return app.getContext("__mqtt_server");
}

function publishLocalMessage(topic, payloadBuffer, callback) {
  getLocalBroker().publish(
    { cmd: "publish", topic, qos: 0, retain: false, dup: false, payload: payloadBuffer },
    (err) => {
      try {
        callback(err);
      } catch (err2) {
        console.error(err2);
      }
    }
  );
}

// Starts the embedded broker and a raw TCP server in front of it.
// NOTE (unresolved): the original code calls `.listen(port)` with no host
// argument, which in plain Node.js `net`/`http` defaults to listening on
// ALL interfaces (0.0.0.0), not just loopback. Whether that's actually
// true for this specific server wrapper wasn't confirmed in this pass -
// see the README.
function startLocalMqttServer(port) {
  const broker = aedes.createBroker({ maxClientsIdLength: 36, authenticate });
  app.setContext("__mqtt_server", broker);

  broker.on("client", (client) => {
    logger.info(`Client[${client.id}] connected`);
  });
  broker.on("publish", (packet, client) => {
    logger.info(`Client[${client?.id}] published ${packet.topic}`);
  });
  broker.on("clientError", (err) => {
    logger.error("Local Mqtt Server on Client Error", err);
  });

  const server = net.createServer(broker.handle);
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info("MQTT Server started and listening on port " + port);
      resolve(true);
    });
  });
}

// Thin subscribe-and-dispatch wrapper used throughout the app (e.g. by
// mqtt-rpc.js) instead of touching the broker directly.
class MqttSubscriber {
  topic;
  started = false;
  onMessage;
  #handler;

  constructor(topic, onMessage) {
    this.topic = topic;
    this.onMessage = onMessage;
    this.#handler = (packet, callback) => {
      callback(undefined);
      try {
        this.#onSubscribed(packet);
      } catch (err) {
        console.error(err);
      }
    };
  }

  #onSubscribed(packet) {
    if (packet.payload instanceof Buffer) this.onMessage(packet.topic, packet.payload);
    else this.onMessage(packet.topic, Buffer.from(packet.payload));
  }

  start() {
    this.started = true;
    getLocalBroker().subscribe(this.topic, this.#handler, () => {
      logger.info("Subscribed to " + this.topic);
    });
  }

  stop() {
    this.started = false;
    getLocalBroker().unsubscribe(this.topic, this.#handler, () => {
      logger.info("UnSubscribed to " + this.topic);
    });
  }
}

module.exports = { AUTH_TABLE, publishLocalMessage, startLocalMqttServer, MqttSubscriber };
