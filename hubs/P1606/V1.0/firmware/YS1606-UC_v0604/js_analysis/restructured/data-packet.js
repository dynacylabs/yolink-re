// Original webpack module: 78940
// Base class for the "DataPacket subclass" family of device-type codecs
// (see device-handlers/door-sensor.js for the fullest example). Simpler
// than it looks - just holds the raw buffer plus a handful of fields that
// get filled in during decode.

const { Protocol } = require("./lora-packet-codec");

class DataPacket {
  deviceId;
  space;
  type;
  buffer;
  needWakeUp;
  loraInfo;
  loraPacketInfo;
  appInfo;
  devClassType;

  constructor(buffer) {
    this.buffer = buffer;
    this.deviceId = undefined;
    this.space = Protocol.LoraCAN;
    this.type = undefined;
    this.loraInfo = undefined;
    this.needWakeUp = false;
    this.devClassType = "ClassC";
  }
}

module.exports = { DataPacket };
