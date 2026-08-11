// Original webpack modules: 523 (HandlerDispatcher), 2261
// (UnitLogicHandler), 12838 (MsgHandlerProxy), 12181 (device
// fetch/cache/registry helpers)
//
// The message bus at the center of the app. Every inbound MQTT
// message/LoRa event gets tagged with a short type string
// ("mqtt.from.hub", "mqtt.from.lorawanDevice", "ylmc.connected", ...) and
// routed through UnitLogicHandler.handle(), which fans out to per-source
// handler methods. MsgHandlerProxy is the write side - other parts of the
// app call its sendXxx() methods to inject a tagged message onto the bus
// rather than knowing about the transport underneath.

const { InterfaceError } = require("./errors");
const { DeviceProxy } = require("./device-proxy"); // original module 62533, not yet transcribed - see README

// Maps YoLink's internal namespace-type strings (as seen in BSDP `type`
// fields and API method prefixes) to the human-readable device-class names
// used everywhere else in the app (device-type-registry.js keys off these).
function translateNSType(nsType) {
  switch (nsType) {
    case "outlet": return "Outlet";
    case "doorSensor": return "DoorSensor";
    case "hub": return "Hub";
    case "infraredRemoter": return "InfraredRemoter";
    case "multiOutlet": return "MultiOutlet";
    case "sprinkler": return "Sprinkler";
    case "THSensor": return "THSensor";
    case "manipulator": return "Manipulator";
    case "bodySensor": return "MotionSensor";
    case "leakSensor": return "LeakSensor";
    case "switch": return "Switch";
    case "GasSmokeSensor": return "COSmokeSensor";
    case "SmartRemoter": return "SmartRemoter";
    case "siren": return "Siren";
    case "vibrationSensor": return "VibrationSensor";
    case "PFSensor": return "PowerFailureAlarm";
    case "lock": return "Lock";
    case "thermostat": return "Thermostat";
    case "garageDoor": return "GarageDoor";
    case "finger": return "Finger";
    case "WaterDepthSensor": return "WaterDepthSensor";
    case "WaterLeakController": return "WaterLeakController";
    case "WaterMeterController": return "WaterMeterController";
    case "MFLock": return "LockV2";
    case "IPCamera": return "IPCamera";
    case "Dimmer": return "Dimmer";
    default: return null;
  }
}

// Routes a REST/RPC-style {body: {method: "Type.action", ...}} request to
// the right per-device-type handler, and builds the outbound MQTT event
// envelope for LoRa uplinks.
class HandlerDispatcher {
  static #sharedInstance;
  #handlers = new Map(); // device-class name -> handler instance

  constructor() {
    this.#loadHandlers();
  }

  #loadHandlers() {
    const { registerHandlers } = require("./device-type-registry"); // original module 14062, not yet transcribed - see README
    registerHandlers(this.#handlers);
  }

  dispatcherAPIRequest(req, res) {
    const deviceClass = req.body.method.split(".")[0];
    if (this.#handlers.has(deviceClass)) return this.#handlers.get(deviceClass).handler(req, res);
    return Promise.reject(new Error("010203")); // "method is not supported"
  }

  // Builds the {type, event, time, msgid, data, deviceId} envelope that
  // gets published to MQTT for a decoded LoRa uplink.
  makeYoLinkEvent(req, res, bsdp) {
    const event = {};
    const deviceClass = translateNSType(bsdp.type);
    if (deviceClass) {
      event.type = deviceClass;
      event.event = deviceClass;
      if (bsdp.method) event.event += "." + bsdp.method;
    } else {
      event.type = bsdp.type;
      event.event = bsdp.type;
      event.method = bsdp.method;
      if (bsdp.method) event.event += "." + bsdp.method;
    }
    event.time = new Date().getTime();
    event.msgid = bsdp.msgid;
    if (bsdp.data) event.data = bsdp.data;
    event.deviceId = bsdp.deviceId;
    return event;
  }

  // "uac" = presumably "uplink/app callback". Builds the event, hands it
  // to the matching handler's handleCallback, then strips fields that
  // shouldn't leave the hub (notably GPS location from LoRa gateway info).
  uacCallback(req, res, bsdp) {
    let event = this.makeYoLinkEvent(req, res, bsdp);
    event = this.#handlers.has(event.type) ? this.#handlers.get(event.type).handleCallback(req, res, event) : undefined;
    if (event != null) {
      delete event.type;
      if (event?.data?.loraInfo?.location) delete event.data.loraInfo.location;
    }
  }

  static sharedInstance() {
    if (HandlerDispatcher.#sharedInstance == null) HandlerDispatcher.#sharedInstance = new HandlerDispatcher();
    return HandlerDispatcher.#sharedInstance;
  }
}

// Base class every source-specific handler extends; almost every method
// here is a "Not Implement" stub in the base and gets overridden per
// message-source concern (hub vs. bare LoRaWAN device vs. app command,
// etc). handle() is the single entry point message-dispatcher callers use.
class UnitLogicHandler {
  dispatcher;
  constructor(dispatcher) {
    this.dispatcher = dispatcher;
  }

  async handleMessageFromHub(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleMessageFromDevice(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  // The actual hot path for most sensor traffic: a raw LoRaWAN uplink
  // that isn't associated with a known device session yet gets one
  // created (or fetched) on demand.
  async handleMessageFromLRWDevice(msg, ctx) {
    try {
      const device = await getOrCreateYoLinkDevice(msg, ctx, this.dispatcher);
      if (device) await device.onReceiveMessage(msg.payload, msg);
      logger.info("Handle Message From KTTDevice Done"); // [sic] "KTTDevice" - legacy internal name, kept for grep-ability
    } catch (err) {
      logger.error(err, "Handler Message error");
    }
  }

  async handleMessageFromYoLinkHub(msg, ctx) {
    try {
      const hub = await fetchYoLinkHub(msg, ctx, this.dispatcher);
      await hub.onReceiveMessage(msg.payload, msg);
    } catch (err) {
      if (err) logger.error(err);
      logger.info("Handle Message From KTTDevice Done");
    }
  }

  handleMessageFromYoLinkIPC(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleMessageToHub(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleMessageFromApp(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  // App-originated commands (from the phone app / cloud) headed to a
  // LoRaWAN device or hub. Routes by deviceId prefix / method prefix to
  // tell "this is for the P1606 hub itself" apart from "this is for a
  // downstream device" apart from "this is for an IP camera".
  async handleMessageFromAppToLoraWAN(msg, ctx) {
    try {
      let target;
      if (msg.payload.method.indexOf("hub.") === 0 || msg.deviceId.indexOf("d88b4c16") === 0) {
        target = await fetchYoLinkHub(msg, ctx, this.dispatcher);
      } else if (msg.payload.method.indexOf("IPCamera.") === 0 || msg.deviceId.indexOf("d88b4c1b") === 0) {
        // IP camera commands intentionally fall through unhandled here.
      } else {
        target = await fetchYoLinkDevice(msg, ctx, this.dispatcher);
      }
      if (target != null) await this.handleAppAction(target, msg.payload, msg);
    } catch (err) {
      if (err) logger.error(err);
      else logger.info("Handle Message From APP Done");
    }
  }

  handleMessageFromCloud(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleHubConnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  // "YLMC" = presumably "YoLink Micro-Controller" or similar - the
  // physical hub's own management-channel connect/disconnect events, as
  // opposed to a downstream device connecting.
  async handleYLMCConnected(msg, ctx) {
    try {
      const hub = await fetchYoLinkHub(msg, ctx, this.dispatcher);
      await hub.onConnected(msg.payload);
    } catch (err) {
      if (err) logger.error(err);
      else logger.info("YoLink Hub:`" + msg.deviceId + "` connected");
    }
  }

  handleIPCConnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  async handleYoLinkDeviceOffline(msg, ctx) {
    try {
      const device = await fetchYoLinkDevice(msg, ctx, this.dispatcher);
      if (device != null) await device.onReceiveOfflineEvent();
    } catch (err) {
      if (err) logger.error(err);
      else logger.info({ deviceId: msg.deviceId }, "YoLink Device:`" + msg.deviceId + "` offline");
    }
  }

  handleDeviceConnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleHubDisconnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  async handleYLMCDisconnected(msg, ctx) {
    try {
      const hub = await fetchYoLinkHub(msg, ctx, this.dispatcher);
      await hub.onDisConnected();
      await disYoLinkHub(msg);
    } catch (err) {
      if (err) logger.error(err);
      else logger.info("YoLink Hub:`" + msg.deviceId + "` disconnected");
    }
  }

  handleIPCDisconnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }
  handleDeviceDisconnected(msg, ctx) { return Promise.reject(new Error("Not Implement")); }

  handleAppAction(device, payload, ctx) {
    return device.handleAppCommand(payload, ctx);
  }

  // The single entry point: tagged messages come in here and get fanned
  // out by `type`. This switch is effectively the whole bus's routing
  // table.
  handle(taggedMessage) {
    switch (taggedMessage.type) {
      case "mqtt.from.hub": return this.handleMessageFromHub(taggedMessage.content, taggedMessage);
      case "mqtt.from.device": return this.handleMessageFromDevice(taggedMessage.content, taggedMessage);
      case "mqtt.from.lorawanDevice": return this.handleMessageFromLRWDevice(taggedMessage.content, taggedMessage);
      case "mqtt.from.yolinkHub": return this.handleMessageFromYoLinkHub(taggedMessage.content, taggedMessage);
      case "mqtt.from.yolinkIPC": return this.handleMessageFromYoLinkIPC(taggedMessage.content, taggedMessage);
      case "mqtt.to.hub": return this.handleMessageToHub(taggedMessage.content, taggedMessage);
      case "mqtt.from.app": return this.handleMessageFromApp(taggedMessage.content, taggedMessage);
      case "mqtt.from.app.toLorawanDevice":
      case "mqtt.to.loracanDevice":
        return this.handleMessageFromAppToLoraWAN(taggedMessage.content, taggedMessage);
      case "mqtt.from.cloud": return this.handleMessageFromCloud(taggedMessage.content, taggedMessage);
      case "hub.connected": return this.handleHubConnected(taggedMessage.content, taggedMessage);
      case "ylmc.connected": return this.handleYLMCConnected(taggedMessage.content, taggedMessage);
      case "ipc.connected": return this.handleIPCConnected(taggedMessage.content, taggedMessage);
      case "yldevice.offline": return this.handleYoLinkDeviceOffline(taggedMessage.content, taggedMessage);
      case "hub.disconnected": return this.handleHubDisconnected(taggedMessage.content, taggedMessage);
      case "ylmc.disconnected": return this.handleYLMCDisconnected(taggedMessage.content, taggedMessage);
      case "ipc.disconnected": return this.handleIPCDisconnected(taggedMessage.content, taggedMessage);
      case "device.disconnected": return this.handleDeviceDisconnected(taggedMessage.content, taggedMessage);
      case "device.connected": return this.handleDeviceConnected(taggedMessage.content, taggedMessage);
    }
  }
}

// Write-side companion to UnitLogicHandler.handle(): wraps whatever the
// underlying transport ("thread") is with named sendXxx() methods so
// callers don't need to know the tag-string routing table above.
class MsgHandlerProxy {
  #thread;
  constructor(thread) {
    this.#thread = thread;
  }
  start() { this.#thread.start(); }
  sendMqttFromLorawanDevice(msg) { this.#thread.sendMessage("mqtt.from.lorawanDevice", msg); }
  sendMqttToLoracanDevice(msg) { this.#thread.sendMessage("mqtt.to.loracanDevice", msg); }
  sendMqttFromYoLinkHub(msg) { this.#thread.sendMessage("mqtt.from.yolinkHub", msg); }
  sendYLMCDisconnected(msg) { this.#thread.sendMessage("ylmc.disconnected", msg); }
  sendYLMCConnected(msg) { this.#thread.sendMessage("ylmc.connected", msg); }
  sendMqttFromYoLinkIPC(msg) { this.#thread.sendMessage("mqtt.from.yolinkIPC", msg); }
  sendIPCDisconnected(msg) { this.#thread.sendMessage("ipc.disconnected", msg); }
  sendIPCConnected(msg) { this.#thread.sendMessage("ipc.connected", msg); }
  sendYLDeviceOffline(msg) { this.#thread.sendMessage("yldevice.offline", msg); }
  sendMQTTFromCloud(msg) { this.#thread.sendMessage("mqtt.from.cloud", msg); }
  sendDeviceConnected(msg) { this.#thread.sendMessage("device.connected", msg); }
  sendHubConnected(msg) { this.#thread.sendMessage("hub.connected", msg); }
  sendDeviceDisconnected(msg) { this.#thread.sendMessage("device.disconnected", msg); }
  sendHubDisconnected(msg) { this.#thread.sendMessage("hub.disconnected", msg); }
  sendMQTTFromDevice(msg) { this.#thread.sendMessage("mqtt.from.device", msg); }
  sendMQTTFromHub(msg) { this.#thread.sendMessage("mqtt.from.hub", msg); }
  sendMQTTFromApp(msg) { this.#thread.sendMessage("mqtt.from.app", msg); }
  sendMQTTFromAS(msg) { throw new Error("Should not call this"); }
  sendMQTTFromAppToLorawanDevice(msg) { this.#thread.sendMessage("mqtt.from.app.toLorawanDevice", msg); }
  sendMQTTToHub(msg) { this.#thread.sendMessage("mqtt.to.hub", msg); }
}

// ---------------- In-memory device instance cache (original module 12181) ----------------
// Two separate Maps: one for "real" LoRaWAN devices, one for YoLink hubs
// bridged in as pseudo-devices (see yolink-hub.js). Both are populated
// lazily from the DB/session store on first message and kept for the life
// of the process.
const lorawanDeviceCache = new Map();
const yolinkHubCache = new Map();

function eachLoraWANDevice(fn) {
  lorawanDeviceCache.forEach((device) => { if (fn) fn(device); });
}

function analysisMessageFromHub(msg, ctx) {
  if (!msg.hubId) throw new Error("HubId not Existed!");
  if (msg.payload) {
    if (msg.payload.cmd) msg.cmd = msg.payload.cmd;
    if (msg.payload.id) msg.deviceId = msg.payload.id;
    if (!msg.deviceId) {
      if (msg.payload.r) msg.deviceId = msg.payload.r.substring(0, 8);
      else if (msg.payload.d) msg.deviceId = msg.payload.d.substring(0, 8);
    }
  }
  if (!msg.deviceId) msg.deviceId = msg.hubId;
  return Promise.resolve();
}

async function fetchYoLinkHub(msg, ctx, dispatcher) {
  if (yolinkHubCache.has(msg.deviceId)) return yolinkHubCache.get(msg.deviceId);
  const hub = await DeviceProxy.newYoLinkHubFromDB(msg.deviceId, dispatcher);
  yolinkHubCache.set(msg.deviceId, hub);
  return hub;
}

async function fetchYoLinkDevice(msg, ctx, dispatcher) {
  return lorawanDeviceCache.has(msg.deviceId)
    ? lorawanDeviceCache.get(msg.deviceId)
    : await DeviceProxy.newYoLinkDeviceFromDB(msg.deviceId, dispatcher);
}

async function getOrCreateYoLinkDevice(msg, ctx, dispatcher) {
  if (lorawanDeviceCache.has(msg.deviceId)) return lorawanDeviceCache.get(msg.deviceId);
  const device = await DeviceProxy.newLoraWANDeviceWithAppEUI(msg.payload.appInfo.key, msg.deviceId, dispatcher);
  lorawanDeviceCache.set(msg.deviceId, device);
  return device;
}

function disLoraWANDevice(msg) {
  if (lorawanDeviceCache.has(msg.deviceId)) {
    lorawanDeviceCache.get(msg.deviceId).destroy();
    lorawanDeviceCache.delete(msg.deviceId);
  }
  return Promise.resolve();
}

function disYoLinkHub(msg) {
  if (yolinkHubCache.has(msg.deviceId)) {
    yolinkHubCache.get(msg.deviceId).destroy((err) => {
      if (err) yolinkHubCache.delete(msg.deviceId);
    });
  }
  return Promise.resolve();
}

function getLorawanDeviceById(deviceId) {
  return lorawanDeviceCache.get(deviceId);
}
function getYoLinkHub(deviceId) {
  return yolinkHubCache.get(deviceId);
}

module.exports = {
  translateNSType,
  HandlerDispatcher,
  UnitLogicHandler,
  MsgHandlerProxy,
  eachLoraWANDevice,
  analysisMessageFromHub,
  fetchYoLinkHub,
  fetchYoLinkDevice,
  getOrCreateYoLinkDevice,
  disLoraWANDevice,
  disYoLinkHub,
  getLorawanDeviceById,
  getYoLinkHub,
};
