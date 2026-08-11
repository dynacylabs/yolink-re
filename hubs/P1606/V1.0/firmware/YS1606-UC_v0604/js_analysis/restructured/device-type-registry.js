// Original webpack module: 73954
//
// The master device-type registration table - wires every DataPacket-
// subclass device handler (see device-command-tables.md) into both the
// encode-side and decode-side CommandRegister (lora-packet-codec.js's
// DeviceDecoderRegister/DeviceEncoderRegister, aliased here as `e`/`t`)
// under the LoraCAN protocol. Confirms the type-key string used
// throughout the rest of the bundle. Every class referenced here is now
// fully hand-transcribed (see device-command-tables.md), including
// "CSDevice" (module 94837) - registered here exactly like every other
// real device type, with no special-casing, consistent with
// cs-device.js's finding that it's a generic passthrough handler rather
// than a distinct real device.

const { Protocol } = require("./lora-packet-codec");
const { DoorSensor } = require("./device-handlers/door-sensor");
const { Lock } = require("./device-handlers/lock");
const { GarageDoor } = require("./device-handlers/garage-door");
const { Manipulator } = require("./device-handlers/manipulator");
const { MultiOutlet } = require("./device-handlers/multi-outlet");
const { BodySensor } = require("./device-handlers/body-sensor");
const { LeakSensor } = require("./device-handlers/leak-sensor");
const { InfraredRemoter } = require("./device-handlers/infrared-remoter");
const { THSensor } = require("./device-handlers/th-sensor");
const { Sprinkler } = require("./device-handlers/sprinkler");
const { Thermostat } = require("./device-handlers/thermostat");
const { Finger } = require("./device-handlers/finger");
const { Siren } = require("./device-handlers/siren");
const { GasSmokeSensor } = require("./device-handlers/gas-smoke-sensor");
const { SmartRemoter } = require("./device-handlers/smart-remoter");
const { CSDevice } = require("./device-handlers/cs-device");
const { PowerFailureDetector } = require("./device-handlers/power-failure-detector");
const { VibrationSensor } = require("./device-handlers/vibration-sensor");
const { Dimmer } = require("./device-handlers/dimmer");
const { WaterDepthSensor } = require("./device-handlers/water-depth-sensor");
const { VapeSoundDetector } = require("./device-handlers/vape-sound-detector");

class DeviceTypeRegistration {
  dpClazz;
  type;

  constructor(type, dpClazz) {
    this.dpClazz = dpClazz;
    this.type = type;
  }

  decode(rawPacket, context) {
    let packet = new this.dpClazz(rawPacket);
    packet.type = this.type;
    packet.appInfo = context.appInfo;
    packet.loraInfo = context.loraInfo;
    packet.loraPacketInfo = context.loraPacketInfo;
    packet.deviceId = context.deviceId;
    return packet._anasysFromPacket ? packet._anasysFromPacket() : undefined; // [sic] "_anasysFromPacket"
  }

  encode(brdp, context) {
    let packet = new this.dpClazz(Buffer.alloc(0));
    packet.type = this.type;
    packet.appInfo = context.appInfo;
    return packet._generateFromBRDP ? packet._generateFromBRDP(brdp) : undefined;
  }

  apply(decoderRegister, encoderRegister) {
    encoderRegister.registerDevice(Protocol.LoraCAN, this.type, this.type, this);
    decoderRegister.registerDevice(Protocol.LoraCAN, this.type, this.type, this);
  }
}

function registerType(type, dpClazz, decoderRegister, encoderRegister) {
  new DeviceTypeRegistration(type, dpClazz).apply(decoderRegister, encoderRegister);
}

// Registers every known device type against the given decoder/encoder
// registers - see message-dispatcher.js / app.js's loadAllAppTasks for
// where this actually gets called during startup.
function register(decoderRegister, encoderRegister) {
  registerType("doorSensor", DoorSensor, decoderRegister, encoderRegister);
  registerType("lock", Lock, decoderRegister, encoderRegister);
  registerType("garageDoor", GarageDoor, decoderRegister, encoderRegister);
  registerType("manipulator", Manipulator, decoderRegister, encoderRegister);
  registerType("multiOutlet", MultiOutlet, decoderRegister, encoderRegister);
  registerType("bodySensor", BodySensor, decoderRegister, encoderRegister);
  registerType("leakSensor", LeakSensor, decoderRegister, encoderRegister);
  registerType("infraredRemoter", InfraredRemoter, decoderRegister, encoderRegister);
  registerType("THSensor", THSensor, decoderRegister, encoderRegister);
  registerType("sprinkler", Sprinkler, decoderRegister, encoderRegister);
  registerType("thermostat", Thermostat, decoderRegister, encoderRegister);
  registerType("finger", Finger, decoderRegister, encoderRegister);
  registerType("siren", Siren, decoderRegister, encoderRegister);
  registerType("GasSmokeSensor", GasSmokeSensor, decoderRegister, encoderRegister);
  registerType("SmartRemoter", SmartRemoter, decoderRegister, encoderRegister);
  registerType("CSDevice", CSDevice, decoderRegister, encoderRegister);
  registerType("PFSensor", PowerFailureDetector, decoderRegister, encoderRegister);
  registerType("vibrationSensor", VibrationSensor, decoderRegister, encoderRegister);
  registerType("Dimmer", Dimmer, decoderRegister, encoderRegister);
  registerType("WaterDepthSensor", WaterDepthSensor, decoderRegister, encoderRegister);
  registerType("VapeSoundDetector", VapeSoundDetector, decoderRegister, encoderRegister);
}

module.exports = { register };
