// Original webpack module: 55432 (WaterDepthSensor)
const { DataPacket } = require("../data-packet");

class WaterDepthSensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysAlarmState(result, byte) {
    result.data = result.data || {};
    result.data.alarm = {
      highAlarm: (4 & byte) > 0,
      lowAlarm: (8 & byte) > 0,
      detectorError: (16 & byte) > 0 || (32 & byte) > 0,
      reminder: (64 & byte) > 0,
    };
  }

  anasysWaterDepth(result, buffer, offset) {
    result.data.waterDepth = buffer.readUInt16BE(offset);
  }

  anasysAlarmSettings(result, buffer, offset) {
    result.data.alarmSettings = {
      standby: buffer.readUInt16BE(offset),
      interval: buffer[offset + 2],
      high: buffer.readUInt16BE(offset + 3),
      low: buffer.readUInt16BE(offset + 5),
    };
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysReportInterval(result, byte) {
    result.data.reportInterval = byte || 0;
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
    this.anasysAlarmState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysWaterDepth(result, packet.buffer, 4);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysAlarmState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysWaterDepth(result, packet.buffer, 4);
    this.anasysAlarmSettings(result, packet.buffer, 6);
    this.anasysReportInterval(result, packet.buffer[13]);
    this.anasysVersion(result, packet.buffer.slice(14, 16).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 17);
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysAlarmState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysWaterDepth(result, packet.buffer, 4);
    this.anasysVersion(result, packet.buffer.slice(12, 14).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysAlarmState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysWaterDepth(result, packet.buffer, 4);
    this.anasysAlarmSettings(result, packet.buffer, 6);
    this.anasysReportInterval(result, packet.buffer[13]);
    this.anasysVersion(result, packet.buffer.slice(14, 16).toString("hex"));
    this.anasysDeviceTemperature(result, packet, 17);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetAttributes(result, buffer) {
    result.method = "setAttributes";
    result.data = result.data || {};
    this.anasysAlarmSettings(result, buffer, 2);
    this.anasysReportInterval(result, buffer[9]);
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "WaterDepthSensor" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetAttributes(result, this.buffer);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetAttributes(request) {
    var buffer = Buffer.from([0, 39, 255, 255, 255, 255, 255, 255, 255, 255]);
    if (request.params && request.params.alarmSettings) {
      if (request.params.alarmSettings.standby != null) buffer.writeUInt16BE(request.params.alarmSettings.standby, 2);
      if (request.params.alarmSettings.interval != null) buffer[4] = request.params.alarmSettings.interval;
      if (request.params.alarmSettings.high != null) buffer.writeUInt16BE(request.params.alarmSettings.high, 5);
      if (request.params.alarmSettings.low != null) buffer.writeUInt16BE(request.params.alarmSettings.low, 7);
    }
    if (request.params.reportInterval != null) buffer[9] = request.params.reportInterval;
    return buffer;
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  _generateFromBRDP(request) {
    var action = request.method.split(".")[1];
    if (action == "getState") return this.genGetState();
    if (action == "getVersion") return this.genGetVersion();
    if (action == "factoryReset") return this.genFactoryReset();
    if (action == "setOpenRemind") {
      // [sic] - dead branch in the original: recognized but no handler wired
    } else if (action == "setAttributes") {
      return this.genSetAttributes(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { WaterDepthSensor };
