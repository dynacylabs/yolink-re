// Original webpack module: 62533 (DeviceProxy)
//
// Factory for turning a bare device ID (or an AppEUI for a
// never-seen-before device) into a live YoLinkDevice/YoLinkHub instance,
// loading or creating its DeviceSession as needed. This is what
// message-dispatcher.js's fetchYoLinkHub/fetchYoLinkDevice/
// getOrCreateYoLinkDevice call into on a cache miss.

const { deviceNsTypeFromAppEUI } = require("./device-type-from-appeui"); // original module 96324
const { newYoLinkDeviceSessionFromDB, newYoLinkDeviceSessionWithType } = require("./device-session-store"); // original module 76802, not yet transcribed - see README
const { YoLinkHubSession } = require("./device-session");
const { YoLinkDevice } = require("./yolink-device");
const { YoLinkHub } = require("./yolink-hub");

class DeviceProxy {
  static async newYoLinkDeviceFromDB(deviceId, dispatcher) {
    const session = await newYoLinkDeviceSessionFromDB(deviceId);
    if (session == null) throw new Error("No Session");
    return DeviceProxy.newLoraWANDeviceBySession(session, dispatcher);
  }

  // Unlike a regular device, a hub with no existing session gets one
  // created on the spot (rather than failing) - a hub connecting for the
  // first time is expected, not an error condition.
  static async newYoLinkHubFromDB(deviceId, dispatcher) {
    let session = await newYoLinkDeviceSessionFromDB(deviceId);
    if (session == null) {
      session = new YoLinkHubSession(deviceId, deviceId);
      session.serviceId = INSTANCEID;
      session.needSave = true;
    }
    return new YoLinkHub(deviceId, dispatcher, session);
  }

  // Used the first time a LoRaWAN device is ever seen: no session exists
  // yet, so its device type has to be inferred from its AppEUI prefix.
  static async newLoraWANDeviceWithAppEUI(appEUI, deviceId, dispatcher) {
    let session = await newYoLinkDeviceSessionFromDB(deviceId);
    if (session != null) return DeviceProxy.newLoraWANDeviceBySession(session, dispatcher);

    const deviceType = deviceNsTypeFromAppEUI(appEUI);
    if (deviceType == null) return Promise.reject("Not supported device type");

    session = newYoLinkDeviceSessionWithType(deviceType, deviceId, appEUI);
    session.serviceId = INSTANCEID;
    session.needSave = true;
    return DeviceProxy.newLoraWANDeviceBySession(session, dispatcher);
  }

  static newLoraWANDeviceBySession(session, dispatcher) {
    return new YoLinkDevice(session.deviceId, dispatcher, session);
  }
}

module.exports = { DeviceProxy };
