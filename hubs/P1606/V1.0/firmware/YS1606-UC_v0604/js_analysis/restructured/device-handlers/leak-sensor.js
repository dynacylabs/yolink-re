// Original webpack module: 56464 (LeakSensor)
//
// The most model-branching handler among the simple sensors: several
// fields' presence/meaning depends on the device's AppEUI-embedded
// product-number substring (bytes 3-4, hex chars 6-10) - "7903", "7904",
// "7906", "7916" each report a slightly different trailing byte layout
// for freeze-temperature/stay-detector/loraP2PHash fields. Kept exactly
// as branched in the original rather than "simplified."

const { DataPacket } = require("../data-packet");

function matchesProductKey(packet, key) {
  return packet.appInfo?.appEUI.substring(6, 10).toLowerCase() == key.toLowerCase();
}

class LeakSensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysSensorMode(result, buffer, offset) {
    result.data = result.data || {};
    result.data.sensorMode = buffer.length > offset && buffer[offset] ? "WaterPeak" : "WaterLeak";
  }

  anasysSensitivity(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.sensitivity = buffer[offset] == 1 ? "high" : "low";
  }

  // In "WaterPeak" mode, state bit 0 means full/dry; in "WaterLeak" mode
  // (the default), the same bit means normal/alert.
  anasysState(result, stateByte) {
    result.data = result.data || {};
    let bit0 = 1 & (stateByte || 0);
    if (result.data.sensorMode == "WaterPeak") result.data.state = ["full", "dry"][bit0] || "dry";
    else result.data.state = ["normal", "alert"][bit0] || "normal";
    result.data.alarmState = {
      stayError: (2 & stateByte) > 0,
      detectorError: (4 & stateByte) > 0,
      freezeError: (8 & stateByte) > 0,
      reminder: (64 & stateByte) > 0,
    };
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysBeep(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.beep = (buffer[offset] || 0) == 1;
  }

  anasysInterval(result, byte) {
    result.data = result.data || {};
    result.data.interval = byte || 0;
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

  // Freeze-alarm temperature threshold - only present on the 7906/7916
  // product variants, encoded as tenths of a degree.
  anasysFreezeTemperature(result, packet, offset) {
    if ((matchesProductKey(packet, "7906") || matchesProductKey(packet, "7916")) && packet.buffer.length >= offset + 2) {
      result.data.freezeTemp = packet.buffer.readInt16BE(offset) / 10;
    }
  }

  anasysStayDetectorTime(result, packet, offset) {
    if (packet.buffer.length >= offset + 2) {
      result.data.stayDetector = { standBy: packet.buffer.readUInt16BE(offset) };
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
    this.anasysSensorMode(result, packet.buffer, 8);
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 6);
    this.anasysBeep(result, packet.buffer, 7);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysSensorMode(result, packet.buffer, 10);
    result.data.supportChangeMode =
      packet.buffer.length > 10 && !matchesProductKey(packet, "7906") && !matchesProductKey(packet, "7916");
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysInterval(result, packet.buffer[4]);
    this.anasysVersion(result, packet.buffer.slice(5, 7).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 8);
    if (matchesProductKey(packet, "7903")) {
      result.data.beep = undefined;
      result.data.sensitivity = undefined;
    } else {
      this.anasysBeep(result, packet.buffer, 9);
      this.anasysSensitivity(result, packet.buffer, 11);
    }
    if (matchesProductKey(packet, "7904") && packet.buffer.length >= 14) {
      result.data.alertStandby = packet.buffer.readUint16BE(12); // [sic] FINDING: real bug - Buffer has no readUint16BE (only readUInt16BE, capital I, used correctly elsewhere in this same file); this throws TypeError at runtime for any "7904"-keyed device with a >=14-byte Report
    } else {
      this.anasysFreezeTemperature(result, packet, 12);
      this.anasysStayDetectorTime(result, packet, 14);
    }
    if (matchesProductKey(packet, "7903") && packet.buffer.length >= 10) result.data.loraP2PHash = packet.buffer[9];
    if (matchesProductKey(packet, "7904") && packet.buffer.length >= 15) result.data.loraP2PHash = packet.buffer[14];
    if (matchesProductKey(packet, "7906") && packet.buffer.length >= 17) result.data.loraP2PHash = packet.buffer[16];
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysSensorMode(result, packet.buffer, 8);
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 6);
    this.anasysBeep(result, packet.buffer, 7);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysSensorMode(result, packet.buffer, 10);
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

  anasysSetInterval(result, packet) {
    result.method = "setInterval";
    this.anasysInterval(result, packet.buffer[2]);
    this.anasysBeep(result, packet.buffer, 3);
    this.anasysSensorMode(result, packet.buffer, 4);
    this.anasysSensitivity(result, packet.buffer, 5);
    if (matchesProductKey(packet, "7904") && packet.buffer.length >= 8) {
      result.data.alertStandby = packet.buffer.readUint16BE(6); // [sic] same bug as anasysReport above
    } else {
      this.anasysFreezeTemperature(result, packet, 6);
      this.anasysStayDetectorTime(result, packet, 8);
    }
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "leakSensor" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetInterval(result, this);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetInterval(request) {
    var buffer = Buffer.from([0, 39, 255, 255, 255, 255, 238, 238, 255, 255]);
    if (request.params && request.params.interval != null) buffer[2] = request.params.interval;
    if (request.params && request.params.beep != null) buffer[3] = request.params.beep ? 1 : 0;
    if (request.params && request.params.sensorMode != null) buffer[4] = request.params.sensorMode == "WaterPeak" ? 1 : 0;
    if (request.params && request.params.sensitivity != null) buffer[5] = request.params.sensitivity == "high" ? 1 : 0;
    if (request.params && request.params.alertStandby != null) buffer.writeUInt16BE(request.params.alertStandby, 6);
    if (request.params && request.params.freezeTemp != null) {
      let tenths = Math.floor(10 * request.params.freezeTemp);
      buffer.writeInt16BE(tenths, 6);
    }
    if (request.params && request.params.stayDetector && request.params.stayDetector.standBy != null) {
      buffer.writeUInt16BE(request.params.stayDetector.standBy, 8);
    }
    return buffer;
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  // [sic] - dead code: registered nowhere in _generateFromBRDP's actual
  // dispatch below despite existing as a method (kept faithful).
  setOpenRemind(request) {
    var bytes = [0, 39];
    if (request.params && request.params.delay != null) bytes.push(request.params.delay);
    return Buffer.from(bytes);
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setOpenRemind") return this.setOpenRemind(request);
    if (action == "setInterval") return this.genSetInterval(request);
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { LeakSensor };
