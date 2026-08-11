// Original webpack module: 81229 (SmartRemoter)
const { DataPacket } = require("../data-packet");

function matchesProductKey(packet, key) {
  return packet.appInfo?.appEUI.substring(6, 10).toLowerCase() == key.toLowerCase();
}

class SmartRemoter extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysEvent(result, buffer, offset) {
    result.data = result.data || {};
    result.data.event = { keyMask: buffer.readUInt16BE(offset), type: ["LongPress", "Press"][buffer[offset + 2]] };
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
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
    this.anasysEvent(result, packet.buffer, 2);
    this.anasysBattery(result, packet.buffer[5]);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysBeep(result, packet, 10);
    this.anasysLoraInfo(result);
  }

  // "beep" is only reported on firmware versions in specific ranges -
  // either any version >= 0x0500 with top-byte >= 5, or 1031-1071
  // decimal - kept faithful to the original's two-part range check.
  anasysBeep(result, packet, offset) {
    let beep = (function versionSupportsBeep(versionHex, buffer, off) {
      if ((function inBeepVersionRange(versionHex2, buffer2, off2) {
        let versionInt = parseInt(versionHex2, 16);
        if (buffer2.length > off2) {
          if ((65280 & versionInt) >= 1280) return true;
          if (versionInt >= 1031 && versionInt < 1072) return true;
        }
        return false;
      })(versionHex, buffer, off)) {
        return buffer[off] == 1;
      }
    })(result.data.version, packet.buffer, offset);
    if (beep != null) result.data.beep = beep;
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysEvent(result, packet.buffer, 2);
    this.anasysBattery(result, packet.buffer[5]);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysBeep(result, packet, 10);
    if (
      (matchesProductKey(packet, "3614") || matchesProductKey(packet, "3615") || matchesProductKey(packet, "3605")) &&
      packet.buffer.length >= 12
    ) {
      result.data.loraP2PHash = packet.buffer[11];
    }
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysEvent(result, packet.buffer, 2);
    this.anasysBattery(result, packet.buffer[5]);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysEvent(result, packet.buffer, 2);
    this.anasysBattery(result, packet.buffer[5]);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetSettings(result, packet) {
    result.method = "setSettings";
    result.data = result.data || {};
    result.data.beep = packet.buffer[2] == 1;
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "SmartRemoter" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetSettings(result, this);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetSettings(request) {
    var bytes = [0, 39];
    if (request.params && request.params.beep != null) bytes.push(request.params.beep ? 1 : 0);
    return Buffer.from(bytes);
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  // [sic] - defined but never wired into _generateFromBRDP's dispatch below.
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
    if (action == "sendEvent") return Buffer.from([]); // no-op ack, kept faithful
    if (action == "setSettings") return this.genSetSettings(request);
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { SmartRemoter };
