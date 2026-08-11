// Original webpack module: 61480 (GasSmokeSensor)
const { DataPacket } = require("../data-packet");

class GasSmokeSensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, byte) {
    result.data = result.data || {};
    result.data.state = {
      unexpected: (1 & byte) > 0 || (128 & byte) > 0,
      sLowBattery: (2 & byte) > 1,
      smokeAlarm: (4 & byte) > 0,
      gasAlarm: (8 & byte) > 0,
      highTempAlarm: (16 & byte) > 0,
      silence: (32 & byte) > 0,
    };
    result.data.metadata = { inspect: (64 & byte) > 0 };
    if (result.data.metadata.inspect == 1) result.data.lastInspection = { time: Date.now() };
  }

  anasysTimeZone(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.tz = buffer.readInt8(offset);
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysInterval(result, buffer, offset) {
    result.data = result.data || {};
    result.data.interval = buffer.readUInt16BE(offset);
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

  anasysSchedule(buffer, offset) {
    return {
      type: ["disable", "weekly", "monthly"][buffer[offset]],
      day: buffer[offset + 1],
      time: `${buffer[offset + 2]}:${buffer[offset + 3]}`,
    };
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
    this.anasysInterval(result, packet.buffer, 4);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysTimeZone(result, packet.buffer, 10);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysInterval(result, packet.buffer, 4);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysTimeZone(result, packet.buffer, 10);
    result.data.sche = this.anasysSchedule(packet.buffer, 11);
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
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysInterval(result, packet.buffer, 4);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 9);
    this.anasysTimeZone(result, packet.buffer, 10);
    this.anasysLoraInfo(result);
  }

  // [sic] - stub, no field decoding.
  anasysSetState(result, packet) {
    result.method = "setState";
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetInterval(result, buffer) {
    result.method = "setInterval";
    this.anasysInterval(result, buffer, 2);
    this.anasysLoraInfo(result);
  }

  anasysSetTimeZone(result, packet) {
    result.method = "setTimeZone";
    result.data = result.data || {};
    this.anasysTimeZone(result, packet.buffer, 2);
  }

  anasysSetSchedule(result, packet) {
    result.method = "setSchedule";
    result.data = this.anasysSchedule(packet.buffer, 2);
  }

  anasysGetSchedule(result, packet) {
    result.method = "getSchedule";
    result.data = this.anasysSchedule(packet.buffer, 2);
  }

  _anasysFromPacket() {
    var result = { type: "GasSmokeSensor" };
    // A specific AppEUI prefix (d88b4c7a02...) identifies a Class D
    // (always-listening) variant, overriding the default Class A.
    if (/^d88b4c7a02/gi.test(this.appInfo.appEUI)) this.devClassType = "ClassD";
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 26: this.anasysSetState(result, this); break;
      case 34: this.anasysGetSchedule(result, this); break;
      case 35: this.anasysSetSchedule(result, this); break;
      case 39: this.anasysSetInterval(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetInterval(request) {
    var buffer = Buffer.from([0, 39, 255, 255]);
    if (request.params && request.params.interval != null) buffer.writeInt16BE(request.params.interval, 2);
    return buffer;
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genSetState(request) {
    var buffer = Buffer.from([0, 26, 255, 255]);
    if (request.params && request.params.inspect === true) buffer[2] = 1;
    return buffer;
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  genSetTimeZone(request) {
    var buffer = Buffer.from([0, 36, 0]);
    buffer.writeInt8(parseInt(request.params.tz), 2);
    return buffer;
  }

  genSetSchedule(request) {
    var buffer = Buffer.from([0, 35, 255, 255, 255, 255]);
    const scheduleTypeIndex = ["disable", "weekly", "monthly"].indexOf(request.params.type);
    buffer[2] = scheduleTypeIndex == -1 ? 255 : scheduleTypeIndex;
    if (buffer[2] != 255) {
      buffer[3] = request.params.day;
      var timeParts = request.params.time.split(":");
      buffer[4] = parseInt(timeParts[0]);
      buffer[5] = parseInt(timeParts[1]);
      return buffer;
    }
  }

  genGetSchedule() {
    return Buffer.from([0, 34, 0]);
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setInterval") return this.genSetInterval(request);
    if (action == "setState") return this.genSetState(request);
    if (action == "setTimeZone") return this.genSetTimeZone(request);
    if (action == "setSchedule") return this.genSetSchedule(request);
    if (action == "getSchedule") return this.genGetSchedule();
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { GasSmokeSensor };
