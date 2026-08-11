// Original webpack module: 25229 (PowerFailureDetector, type key "PFSensor")
const { DataPacket } = require("../data-packet");

class PowerFailureDetector extends DataPacket {
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
    result.data.state = ["normal", "alert", "off", "alert"][stateByte] || "off";
    result.data.alertType = stateByte == 3 ? "remind" : undefined;
  }

  anasysSoundLevel(result, byte) {
    result.data = result.data || {};
    result.data.sound = byte || 0;
  }

  // Low nibble = battery level, bit 7 = external power present.
  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = 15 & (byte || 0);
    result.data.powerSupply = !!((byte || 0) >> 7);
  }

  anasysAlertDuration(result, buffer, offset) {
    if (buffer.length > offset + 1) {
      result.data = result.data || {};
      result.data.alertDuration = buffer.readUInt16BE(offset);
    }
  }

  anasysAlertInterval(result, byte) {
    result.data = result.data || {};
    result.data.alertInterval = byte || 0;
  }

  anasysVersion(result, versionHex) {
    if (versionHex) {
      result.data = result.data || {};
      result.data.version = versionHex || 0;
    }
  }

  // Mute flag is only present on firmware version 0x0609-0x069F (1545 <=
  // version < 1696, decimal) - older/newer firmware doesn't report it.
  anasysMute(result, packet, offset) {
    let mute = (function versionSupportsMute(versionHex, buffer, off) {
      if ((function inMuteVersionRange(versionHex2, buffer2, off2) {
        let versionInt = parseInt(versionHex2, 16);
        return versionInt >= 1545 && versionInt < 1696 && buffer2.length > off2;
      })(versionHex, buffer, off)) {
        return buffer[off] == 1;
      }
    })(result.data.version, packet.buffer, offset);
    if (mute != null) result.data.mute = mute;
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
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    this.anasysAlertDuration(result, packet.buffer, 5);
    this.anasysAlertInterval(result, packet.buffer[7]);
    this.anasysVersion(result, packet.buffer.slice(8, 10).toString("hex"));
    this.anasysMute(result, packet, 11);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    this.anasysAlertDuration(result, packet.buffer, 5);
    this.anasysAlertInterval(result, packet.buffer[7]);
    this.anasysVersion(result, packet.buffer.slice(8, 10).toString("hex"));
    this.anasysMute(result, packet, 11);
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    this.anasysAlertDuration(result, packet.buffer, 5);
    this.anasysAlertInterval(result, packet.buffer[7]);
    this.anasysVersion(result, packet.buffer.slice(8, 10).toString("hex"));
    this.anasysMute(result, packet, 11);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetOption(result, buffer) {
    result.method = "setOption";
    result.data = result.data || {};
    this.anasysAlertDuration(result, buffer, 2);
    this.anasysAlertInterval(result, buffer[4]);
    if (buffer.length >= 6) result.data.mute = buffer[5] == 1;
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "PFSensor" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 39: this.anasysSetOption(result, this.buffer);
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

  setOption(request) {
    var buffer = Buffer.from([0, 39, 255, 255, 255, 255]);
    let params = {};
    if (request.params && request.params.alertInterval != null) {
      buffer[4] = request.params.alertInterval;
      params.alertInterval = request.params.alertInterval;
    }
    if (request.params.alertDuration != null) {
      buffer.writeUInt16BE(request.params.alertDuration, 2);
      params.alertDuration = request.params.alertDuration;
    }
    if (request.params.mute != null) buffer[5] = request.params.mute ? 1 : 0;
    return buffer;
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setOption") return this.setOption(request);
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { PowerFailureDetector };
