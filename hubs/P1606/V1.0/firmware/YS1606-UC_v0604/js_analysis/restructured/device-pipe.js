// Original webpack module: 41073
//
// Wires message-dispatcher.js's UnitLogicHandler up to an internal
// EventEmitter "thread" (DevicePipe) via MsgHandlerProxy, and gives it a
// way to actually send MQTT messages back out (sendMqttMessage, routed
// through general-client.js's Client.sendMQTTMessage). Three of
// DevicePipeThread's methods are unimplemented stubs that throw -
// sendMQTTBridgeMessage, sendCreateTimerMessage, sendDeleteTimerMessage -
// suggesting either dead/future functionality, or callers that are
// expected to never actually reach these paths in this firmware build.

const { EventEmitter } = require("events");
const { MsgHandlerProxy } = require("./message-dispatcher");
const { UnitLogicHandler } = require("./message-dispatcher");

class DevicePipe {
  internalThread;

  constructor() {
    this.internalThread = new DevicePipeThread();
  }

  start() {
    this.internalThread.start();
  }

  sendMessage(type, content) {
    this.internalThread.emit("ys_event", { type, content });
  }
}

class DevicePipeThread extends EventEmitter {
  handler;

  constructor() {
    super();
    this.handler = new UnitLogicHandler(this);
  }

  start() {
    this.on("ys_event", (event) => {
      try {
        this.handler.handle(event);
      } catch (e) {
        logger.error(e);
      }
    });
  }

  sendMqttMessage(msg) {
    getDevicePipe().sendMQTTMessage(msg.channel, Buffer.from(JSON.stringify(msg.payload)), msg.clientId);
  }

  sendMQTTBridgeMessage(msg) {
    throw new Error("Method not implemented.");
  }

  sendCreateTimerMessage(msg) {
    throw new Error("Method not implemented.");
  }

  sendDeleteTimerMessage(msg) {
    throw new Error("Method not implemented.");
  }
}

const state = {};

function getDevicePipe() {
  return state.devicePip; // [sic] "devicePip"
}

function setupInternalDispatcher(client) {
  state.devicePip = client;
  var pipe = new DevicePipe();
  var proxy = new MsgHandlerProxy(pipe);
  proxy.start();
  return proxy;
}

module.exports = { getDevicePipe, setupInternalDispatcher };
