// Original webpack module: 76802
//
// *** This is the second complete device catalog found in this bundle ***
// (the first being device-type-from-appeui.js's model-key table). This
// one maps each device-type string to its default LoRaWAN device class
// (A/C/D), including per-model-variant overrides keyed by literal AppEUI
// prefix - e.g. THSensor is Class A by default, except the "8006" model
// variant, which is Class D. Cross-reference with
// device-type-from-appeui.js to connect a raw AppEUI all the way to
// "what class of LoRaWAN device is this."
//
// Class A devices only get a downlink window right after they transmit
// (battery-sipping, most sensors); Class C devices are always listening
// (mains-powered, e.g. outlets); Class D isn't a real LoRaWAN device
// class - see the README for why that's notable.

const { DeviceSession } = require("./device-session");
const { YoLinkDeviceSessionDao } = require("./redis-session-dao");

function buildSessionForType(deviceType, deviceId, appId) {
  let session;
  const classA = () => { session = new DeviceSession(deviceId, appId); session.devClassType = "ClassA"; };
  const classD = () => { session = new DeviceSession(deviceId, appId); session.devClassType = "ClassD"; };
  const classC = () => { session = new DeviceSession(deviceId, appId); }; // ClassC is DeviceSession's own default

  switch (deviceType) {
    case "doorSensor": classA(); break;
    case "lock": classD(); break;
    case "outlet": classC(); break;
    case "bodySensor":
    case "leakSensor": classA(); break;
    case "manipulator": classD(); break;
    case "multiOutlet": classC(); break;
    case "infraredRemoter": classD(); break;
    case "THSensor":
      classA();
      if (/^d88b4c8006/gi.test(appId)) session.devClassType = "ClassD";
      break;
    case "thermostat":
    case "sprinkler":
    case "pm25":
    case "TMTHSensor":
    case "hub": classC(); break;
    case "siren": classD(); break;
    case "GasSmokeSensor":
      classA();
      if (/^d88b4c7a02/gi.test(appId)) session.devClassType = "ClassD";
      break;
    case "SmartRemoter": classA(); break;
    case "CSDevice": classC(); break; // note: DeviceSession already defaults to ClassC - kept explicit to match original
    case "PFSensor": classA(); break;
    case "finger": classD(); break;
    case "vibrationSensor": classA(); break;
    case "IPCamera":
    case "WaterDepthSensor": classC(); break;
    case "WaterLeakController": classD(); break;
    case "WaterMeterController":
      classD();
      if (/^d88b4c5007/gi.test(appId)) session.devClassType = "ClassA";
      break;
    case "WaterMeterMultiController": classD(); break;
    case "switch":
      classC();
      if (/^d88b4c5709/gi.test(appId)) session.devClassType = "ClassD";
      break;
    case "MFLock": classD(); break;
    default: classC(); break;
  }
  session.deviceType = deviceType;
  return session;
}

function newYoLinkDeviceSessionWithType(deviceType, deviceId, appId) {
  return buildSessionForType(deviceType, deviceId, appId);
}

function newYoLinkDeviceSessionFromJson(json) {
  if (!json.deviceId || !json.deviceType) return;
  let appId = json.appId;
  // Hub sessions don't carry an explicit appId in storage - it's derived
  // from the device ID itself (first 10 hex chars + "000000") when the ID
  // matches the hub prefix "d88b4c16".
  if (appId == null && /^d88b4c16/gi.test(json.deviceId)) appId = json.deviceId.substring(0, 10) + "000000";
  const session = buildSessionForType(json.deviceType, json.deviceId, appId);
  if (session) session.loadWithJson(json);
  return session;
}

async function newYoLinkDeviceSessionFromDB(deviceId) {
  const raw = await YoLinkDeviceSessionDao.getInstance().loadDeviceSession(deviceId);
  if (raw == null) return;
  const session = newYoLinkDeviceSessionFromJson(raw);
  if (session != null) session.needSave = false;
  return session;
}

module.exports = { newYoLinkDeviceSessionWithType, newYoLinkDeviceSessionFromJson, newYoLinkDeviceSessionFromDB };
