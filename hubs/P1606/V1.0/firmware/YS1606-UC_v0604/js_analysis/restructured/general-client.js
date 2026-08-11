// Original webpack modules: 84903 (Client), 30523 (getGeneralClient - a
// per-instance-id singleton cache around Client)
//
// A second, SEPARATE local-MQTT-broker client from mqtt-rpc.js's
// RpcClientOverMQTT - this one implements request/response over plain
// pub/sub (not the RPC framing) and is what automation-engine.js's
// "Device" action type uses to actually send a command to a device via
// sendDeviceMessage(). Connects to the same embedded broker
// (mqtt-local-broker.js, tcp://127.0.0.1:18080) but as the "as"
// (Application Server) identity from that broker's AUTH_TABLE.
//
// FINDING: the password here is a second hardcoded credential, distinct
// from (but consistent in spirit with) mqtt-local-broker.js's AUTH_TABLE -
// every hub running this firmware build embeds the same literal password
// for the "as" MQTT identity.

const mqtt = require("mqtt");
const { InterfaceError } = require("./errors");

class Client {
  serverURL;
  _idMask;
  username;
  password;
  clientId;
  receiveChannel;
  mqttClient;
  callbacks;
  onceListener;

  constructor(idMask) {
    this.serverURL = "tcp://127.0.0.1:18080";
    this.username = "as";
    this.password = "sub-c-2a6a8e14-301b-11e5-b3fa-02ee2ddab7fe"; // hardcoded, same on every hub
    this.clientId = "c1-" + (idMask || INSTANCEID);
    this.receiveChannel = `ys/as/client/${this.clientId}/rec`;
    this.callbacks = {};
    this.onceListener = {};
    this._idMask = idMask;
    this.init();
  }

  init() {
    this.connect();
  }

  connect() {
    this.mqttClient = mqtt.connect(this.serverURL, {
      username: this.username,
      password: this.password,
      clientId: this.clientId,
    });

    this.mqttClient.on("connect", () => {
      this.mqttClient.subscribe(this.receiveChannel);
    });

    this.mqttClient.on("message", (topic, payload) => {
      try {
        let text = payload.toString();
        var msg = JSON.parse(text);
        if (msg.ser) {
          var key = `${msg.deviceId}/${msg.type}.${msg.method}`;
          var onceKey = key;
          process.nextTick(() => {
            if (this.callbacks[key] != null) {
              this.callbacks[key](undefined, msg);
            } else {
              let commonKey = `${msg.deviceId}/common.${msg.method}`;
              if (this.callbacks[commonKey] != null) this.callbacks[commonKey](undefined, msg);
            }
            // Deliver to the oldest matching (or already-expired) once-listener.
            if (this.onceListener[onceKey] && this.onceListener[onceKey].length) {
              var now = new Date().getTime();
              for (var i = 0; i < this.onceListener[onceKey].length; i++) {
                var listener = this.onceListener[onceKey][i];
                if (listener.time < now) {
                  listener.call(new InterfaceError("000202"));
                  this.onceListener[onceKey].splice(i, 1);
                  i--;
                  break;
                }
                if (listener.deviceId && msg.deviceId == listener.deviceId) {
                  listener.call(undefined, msg);
                  this.onceListener[onceKey].splice(i, 1);
                  i--;
                  break;
                }
              }
              if (!this.onceListener[onceKey].length) delete this.onceListener[onceKey];
            }
          });
        }
      } catch (e) {
        console.log(e);
      }
    });

    this.mqttClient.on("error", function () {
      console.log(arguments);
    });
  }

  sendDeviceMessage(msg, callback, options = { timeout: 4000 }) {
    msg.from = {
      type: "AS",
      client: { clientId: this.clientId },
      forward: callback == null ? undefined : { channel: this.receiveChannel, timeout: options?.timeout || 8000 },
    };
    if (msg.producer == null) msg.producer = { type: "API", channel: "API" };
    this.sendGeneralMessage(`/ys/${msg.targetDevice}/tx`, msg, callback);
  }

  sendGeneralMessage(topic, msg, callback) {
    msg.seq = { msgid: new Date().getTime().toString(), ser: "" };
    msg.seq.ser = msg.seq.msgid.substring(6);
    var key = msg.targetDevice + "/" + msg.method;

    if (this.callbacks[key] && callback != null) {
      callback(new InterfaceError("020104"));
      return;
    }

    this.sendMQTTMessage(
      topic,
      msg,
      callback == null
        ? function () {}
        : (err) => {
            if (err) {
              if (callback) callback(new InterfaceError("999999"), undefined);
            } else {
              var timeoutId = setTimeout(() => {
                if (this.callbacks[key]) this.callbacks[key](new InterfaceError("000201"));
              }, msg.from.forward?.timeout || 8000);

              this.callbacks[key] = (err, result) => {
                if (!err && !(result && result.data)) err = new InterfaceError("000202");
                if (callback) callback(err, result ? result.data : result);
                delete this.callbacks[key];
                if (timeoutId) clearTimeout(timeoutId);
              };
            }
          }
    );
  }

  refreshNSFamilyDevices(payload, callback) {
    this.sendNACommand({ method: "ns.refreshFamilyDevice", payload }, callback);
  }

  sendNACommand(cmd, callback) {
    this.sendMQTTMessage("KTTSvrCommand", { channel: "YoLinkAS", method: cmd.method, payload: cmd.payload }, callback);
  }

  sendMQTTMessage(topic, payload, callback) {
    if (typeof payload === "string") this.mqttClient.publish(topic, payload, callback);
    else if (typeof payload === "object") this.mqttClient.publish(topic, JSON.stringify(payload), callback);
    else callback(new Error("000102"));
  }

  // Registers a one-shot listener for a device+method reply, expiring
  // after `timeoutMs` (default 10s) if nothing arrives.
  addOnceListener(deviceId, method, callback, timeoutMs) {
    var key = `${deviceId}/${method}`;
    timeoutMs = timeoutMs || 10000;
    if (!this.onceListener[key]) this.onceListener[key] = [];
    this.onceListener[key].push({ deviceId, time: new Date().getTime() + timeoutMs, call: callback });

    setTimeout(() => {
      var now = new Date().getTime();
      if (this.onceListener[key]) {
        for (var i = 0; i < this.onceListener[key].length; i++) {
          if (this.onceListener[key][i].time < now) {
            var expired = this.onceListener[key].splice(i, 1)[0];
            process.nextTick(() => {
              expired.call(new InterfaceError("000202"));
            });
            i--;
          }
        }
        if (!this.onceListener[key].length) delete this.onceListener[key];
      }
    }, timeoutMs);
  }
}

// Per-instance-id singleton cache - `getGeneralClient()` with no argument
// reuses one shared "main" client; passing a channel-like string
// (truncated to 16 chars, dots/slashes stripped) gets its own cached
// client instance.
const clientsById = {};

function getGeneralClient(id) {
  id = (id == null ? "main_" + INSTANCEID : (id.length > 16 ? id.substring(0, 16) : id) + "_" + INSTANCEID).replace(/(\.)|(\/)/g, "");
  if (!clientsById[id]) clientsById[id] = new Client(id);
  return clientsById[id];
}

module.exports = { Client, getGeneralClient };
