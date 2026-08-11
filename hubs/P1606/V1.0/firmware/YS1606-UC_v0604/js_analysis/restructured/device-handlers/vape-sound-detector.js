// Original webpack module: 57509 (VapeSoundDetector)
const { DataPacket } = require("../data-packet");

class VapeSoundDetector extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassC";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, byte) {
    result.data = result.data || {};
    result.data.state = {
      smoking: (1 & byte) > 0,
      soundDetected: (2 & byte) > 1,
      tampering: (4 & byte) > 0,
      powerOff: (8 & byte) > 0,
    };
  }

  anasysProximityLevel(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.proximityLevel = buffer[offset] || 0;
  }

  anasysSoundSensitivity(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.soundSensitivity = buffer[offset] || 0;
  }

  anasysVapeLevel(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.vapeLevel = buffer[offset] || 0;
  }

  anasysBeepLevel(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.beepLevel = buffer[offset] || 0;
  }

  anasysInterval(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.alertInterval = buffer[offset] || 0;
  }

  anasysVersion(result, versionHex) {
    if (versionHex) {
      result.data = result.data || {};
      result.data.version = versionHex || 0;
    }
  }

  anasysDeviceTemperature(result, packet, offset) {
    if (packet.buffer.length > offset) {
      result.data = result.data || {};
      result.data.devTemperature = packet.buffer.readInt8(offset);
    }
  }

  anasysLoraInfo(result) {
    if (this.loraInfo) {
      result.data = result.data || {};
      result.data.loraInfo = this.loraInfo;
    }
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    this.anasysVersion(result, packet.buffer.slice(3, 5).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 5);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysInterval(result, packet.buffer, 3);
    this.anasysVapeLevel(result, packet.buffer, 4);
    this.anasysProximityLevel(result, packet.buffer, 5);
    this.anasysSoundSensitivity(result, packet.buffer, 6);
    this.anasysBeepLevel(result, packet.buffer, 7);
    this.anasysVersion(result, packet.buffer.slice(8, 10).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 11);
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysVersion(result, packet.buffer.slice(3, 5).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 5);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysInterval(result, packet.buffer, 3);
    this.anasysVapeLevel(result, packet.buffer, 4);
    this.anasysProximityLevel(result, packet.buffer, 5);
    this.anasysSoundSensitivity(result, packet.buffer, 6);
    this.anasysBeepLevel(result, packet.buffer, 7);
    this.anasysVersion(result, packet.buffer.slice(8, 10).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 11);
    this.anasysLoraInfo(result);
  }

  // [sic] - sets only `method`, no field decoding at all (dead/stub).
  anasysSetState(result, packet) {
    result.method = "setState";
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetProperties(result, packet) {
    result.method = "setProperties";
    this.anasysInterval(result, packet.buffer, 2);
    this.anasysVapeLevel(result, packet.buffer, 3);
    this.anasysProximityLevel(result, packet.buffer, 4);
    this.anasysSoundSensitivity(result, packet.buffer, 5);
    this.anasysBeepLevel(result, packet.buffer, 6);
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "VapeSoundDetector" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetProperties(result, this);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetProperties(request) {
    var buffer = Buffer.from([0, 39, 255, 255, 255, 255, 255]);
    if (request.params && request.params.alertInterval != null) buffer[2] = request.params.alertInterval;
    if (request.params && request.params.vapeLevel != null) buffer[3] = request.params.vapeLevel;
    if (request.params && request.params.proximityLevel != null) buffer[4] = request.params.proximityLevel;
    if (request.params && request.params.soundSensitivity != null) buffer[5] = request.params.soundSensitivity;
    if (request.params && request.params.beepLevel != null) buffer[6] = request.params.beepLevel;
    return buffer;
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  // [sic] - defined but never wired into _generateFromBRDP's dispatch below.
  genSetState(request) {
    var buffer = Buffer.from([0, 26, 255, 255]);
    if (request.params && request.params.inspect === true) buffer[2] = 1;
    return buffer;
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setProperties") return this.genSetProperties(request);
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { VapeSoundDetector };
