// Original webpack module: 94039 (BodySensor, type key "bodySensor" - a
// motion sensor, distinct from the smaller motion-sensor-api-handler.js
// at the HTTP layer, which has no LoRa-layer command table entry of its
// own and may just alias this one).
const { DataPacket } = require("../data-packet");

// Firmware version >= 0x0509 (5.9) or >= 0x046C (4.108) reports a 2-byte
// no-motion-delay field instead of 1 byte.
function usesWideNoMotionDelay(versionHex) {
  if (versionHex == null) return false;
  var major = parseInt(versionHex.substring(0, 2), 16);
  var minor = parseInt(versionHex.substring(2, 4), 16);
  return major == 5 ? minor >= 9 : major == 4 && minor >= 108;
}

class BodySensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = ["normal", "alert"][stateByte] || "normal";
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysAlertInterval(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.alertInterval = buffer[offset];
  }

  anasysLEDAlarm(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.ledAlarm = !!buffer[offset];
  }

  // Battery chemistry (Li-ion vs alkaline) is only reported on firmware
  // versions 1289-1439 decimal.
  anasysBatteryType(result, packet, offset) {
    let batteryType = (function versionSupportsBatteryType(versionHex, buffer, off) {
      if ((function inRange(versionHex2, buffer2, off2) {
        let versionInt = parseInt(versionHex2, 16);
        return versionInt >= 1289 && versionInt < 1440 && buffer2.length > off2;
      })(versionHex, buffer, off)) {
        return buffer[off] == 1 ? "Li" : "Al";
      }
    })(result.data.version, packet.buffer, offset);
    if (batteryType != null) result.data.batteryType = batteryType;
  }

  anasysnomotionDelay(result, buffer, offset, byteWidth = 1) { // [sic] lowercase "n" - kept faithful
    result.data = result.data || {};
    if (buffer.length >= offset + byteWidth) {
      if (byteWidth == 1) result.data.nomotionDelay = buffer[offset];
      else if (byteWidth == 2) result.data.nomotionDelay = buffer.readUInt16BE(offset);
    }
  }

  anasysSensitivity(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.sensitivity = buffer[offset];
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
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysLEDAlarm(result, packet.buffer, 6);
    this.anasysAlertInterval(result, packet.buffer, 7);
    if (usesWideNoMotionDelay(result.data.version)) {
      this.anasysnomotionDelay(result, packet.buffer, 8, 2);
      this.anasysSensitivity(result, packet.buffer, 10);
    } else {
      this.anasysnomotionDelay(result, packet.buffer, 8, 1);
      this.anasysSensitivity(result, packet.buffer, 9);
    }
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysLEDAlarm(result, packet.buffer, 6);
    this.anasysAlertInterval(result, packet.buffer, 7);
    if (usesWideNoMotionDelay(result.data.version)) {
      this.anasysnomotionDelay(result, packet.buffer, 8, 2);
      this.anasysSensitivity(result, packet.buffer, 10);
      this.anasysDeviceTemperature(result, packet, 12);
      this.anasysBatteryType(result, packet, 13);
    } else {
      this.anasysnomotionDelay(result, packet.buffer, 8, 1);
      this.anasysSensitivity(result, packet.buffer, 9);
      this.anasysDeviceTemperature(result, packet, 11);
    }
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysLEDAlarm(result, packet.buffer, 6);
    this.anasysAlertInterval(result, packet.buffer, 7);
    if (usesWideNoMotionDelay(result.data.version)) {
      this.anasysnomotionDelay(result, packet.buffer, 8, 2);
      this.anasysSensitivity(result, packet.buffer, 10);
    } else {
      this.anasysnomotionDelay(result, packet.buffer, 8, 1);
      this.anasysSensitivity(result, packet.buffer, 9);
    }
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetOpenRemind(result, buffer) {
    result.method = "setOpenRemind";
    result.data = result.data || {};
    this.anasysAlertInterval(result, buffer, 2);
    this.anasysLEDAlarm(result, buffer, 3);
    if (buffer.length >= 8) {
      this.anasysnomotionDelay(result, buffer, 4, 2);
      this.anasysSensitivity(result, buffer, 6);
    } else {
      this.anasysnomotionDelay(result, buffer, 4, 1);
      this.anasysSensitivity(result, buffer, 5);
    }
    this.anasysLoraInfo(result);
  }

  anasysSetInitState(result, buffer) {
    result.method = "setInitState";
    result.data = result.data || {};
    result.data.initState = { 85: "open", 136: "close", 170: "LastState" }[buffer[2]];
  }

  _anasysFromPacket() {
    var result = { type: "bodySensor" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetOpenRemind(result, this.buffer);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  // Encodes a v1 (1-byte) or v2 (2-byte, big-endian) nomotionDelay field
  // depending on the caller-supplied `protocol` hint - there's no
  // firmware-version auto-detection on the encode side, unlike decode.
  setOpenRemind(request) {
    var bytes = [0, 39];
    var params = {};
    if (request.params && request.params.alertInterval != null) {
      bytes.push(request.params.alertInterval);
      params.alertInterval = request.params.alertInterval;
    } else {
      bytes.push(255);
    }
    if (request.params && request.params.ledAlarm != null) {
      bytes.push(request.params.ledAlarm ? 1 : 0);
      params.ledAlarm = request.params.ledAlarm;
    } else {
      bytes.push(255);
    }
    var delayBytes = [255];
    if (request.params && request.params.protocol == "v2") {
      delayBytes.push(255);
      if (request.params && request.params.nomotionDelay != null) {
        delayBytes[0] = request.params.nomotionDelay >> 8;
        delayBytes[1] = 255 & request.params.nomotionDelay;
        params.nomotionDelay = request.params.nomotionDelay;
      }
    } else if (request.params && request.params.nomotionDelay != null) {
      delayBytes[0] = 255 & request.params.nomotionDelay;
      params.nomotionDelay = request.params.nomotionDelay;
    }
    Array.prototype.push.apply(bytes, delayBytes);
    if (request.params && request.params.sensitivity != null) {
      bytes.push(request.params.sensitivity);
      params.sensitivity = request.params.sensitivity;
    } else {
      bytes.push(255);
    }
    if (request.params && request.params.batteryType != null) {
      bytes.push(request.params.batteryType == "Li" ? 1 : 0);
      params.batteryType = request.params.batteryType;
    } else {
      bytes.push(255);
    }
    return Buffer.from(bytes);
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setOpenRemind") return this.setOpenRemind(request);
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { BodySensor };
