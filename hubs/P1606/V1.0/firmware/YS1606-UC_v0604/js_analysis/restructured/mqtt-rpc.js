// Original webpack module: 3548
//
// A small request/response RPC layer built on top of the local MQTT
// broker (mqtt-local-broker.js): client publishes to "<base>/tx" and
// waits (with a 4s timeout) for a reply on "<base>/rx" matching the same
// method name; server does the mirror image.

const { InterfaceError } = require("./errors");
const { MqttSubscriber, publishLocalMessage } = require("./mqtt-local-broker");

function publishJson(topic, message, callback) {
  publishLocalMessage(topic, Buffer.from(JSON.stringify(message)), callback);
}

class RpcClientOverMQTT {
  txTopic;
  rxTopic;
  #subscriber;
  #pendingCallbacks = new Map(); // method name -> (err, response) => void

  constructor(baseTopic) {
    this.txTopic = baseTopic + "/tx";
    this.rxTopic = baseTopic + "/rx";
    this.#subscriber = new MqttSubscriber(this.rxTopic, (topic, payload) => {
      console.log(payload.toString());
      try {
        this.#onResponseMessage(topic, JSON.parse(payload.toString()));
      } catch (err) {
        logger.error("Invalid rpc message", err);
      }
    });
    this.#subscriber.start();
  }

  sendCommand(request) {
    return new Promise((resolve, reject) => {
      const method = request.method;
      publishJson(this.txTopic, request, (publishErr) => {
        if (publishErr != null) {
          reject(new InterfaceError("999999"));
          return;
        }
        const timeoutHandle = setTimeout(() => {
          if (this.#pendingCallbacks.has(method)) {
            this.#pendingCallbacks.get(method)(new InterfaceError("000201")); // "Cannot connect to the device"
            this.#pendingCallbacks.delete(method);
          }
        }, 4000);

        this.#pendingCallbacks.set(method, (err, response) => {
          if (!err && response && !response.method) err = new InterfaceError("000202"); // "cannot respond to this command"
          this.#pendingCallbacks.delete(method);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          err != null ? reject(err) : resolve(response);
        });
      });
    });
  }

  #onResponseMessage(topic, response) {
    console.log(response);
    if (response?.method != null) {
      const method = response.method;
      if (this.#pendingCallbacks.has(method)) this.#pendingCallbacks.get(method)(undefined, response);
    }
  }
}

class RpcServerOverMQTT {
  txTopic;
  rxTopic;
  #subscriber;

  constructor(baseTopic) {
    this.txTopic = baseTopic + "/tx";
    this.rxTopic = baseTopic + "/rx";
    this.#subscriber = new MqttSubscriber(this.txTopic, (topic, payload) => {
      try {
        this.#onRequestMessage(topic, JSON.parse(payload.toString()));
      } catch (err) {
        logger.error("Invalid rpc message", err);
      }
    });
    this.#subscriber.start();
  }

  // Subclasses/callers are expected to implement onCommand(method, params, request).
  onCommand(method, params, request) {
    throw new Error("onCommand not implemented");
  }

  #onRequestMessage(topic, request) {
    if (request.method == null) return;
    this.onCommand(request.method, request.params, request).then((result) => {
      publishJson(this.rxTopic, { method: request.method, data: result }, (err) => {
        if (err) console.error("Responde failed"); // [sic]
      });
    });
  }
}

module.exports = { RpcClientOverMQTT, RpcServerOverMQTT };
