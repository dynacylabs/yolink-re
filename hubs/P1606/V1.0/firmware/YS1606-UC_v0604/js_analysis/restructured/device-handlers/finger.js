// Original webpack module: 20402 (Finger) - a robotic finger/switch presser
const { DataPacket } = require("../data-packet");

class Finger extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = ["stop", "rising", "falling", "up", "down"][stateByte] || "unknow"; // [sic] "unknow"
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysDatetime(result, buffer, offset) {
    var year = buffer[offset], month = buffer[offset + 1], day = buffer[offset + 2];
    var hour = buffer[offset + 3], minute = buffer[offset + 4], second = buffer[offset + 5];
    result.data.time = new Date(`20${year}/${month}/${day} ${hour}:${minute}:${second}`);
  }

  anasysLoraInfo(result) {
    if (this.loraInfo) {
      result.data = result.data || {};
      result.data.loraInfo = this.loraInfo;
    }
  }

  anasysVersion(result, versionHex) {
    if (versionHex) {
      result.data = result.data || {};
      result.data.version = versionHex || 0;
    }
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 6);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 6);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer[2]);
    this.anasysBattery(result, buffer[3]);
    this.anasysVersion(result, buffer.slice(4, 6).toString("hex"));
    this.anasysDatetime(result, buffer, 6);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 6);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  _anasysFromPacket() {
    var result = { type: "finger" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 26: this.anasysSetState(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26];
    bytes.push(request.params && request.params.state && request.params.state == "up" ? 0 : 1);
    return Buffer.from(bytes);
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

  _generateFromBRDP(request) {
    if (request && request.method) {
      var action = request.method.split(".")[1];
      if (action == "setState") return this.genSetState(request);
      if (action == "getState") return this.genGetState();
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Finger };
