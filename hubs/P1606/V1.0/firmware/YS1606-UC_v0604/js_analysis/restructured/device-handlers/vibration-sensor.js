// Original webpack module: 53257 (VibrationSensor)
const { DataPacket } = require("../data-packet");

class VibrationSensor extends DataPacket {
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
    if (buffer.length > offset + 1) result.data.alertInterval = buffer.readInt16BE(offset);
  }

  anasysNoVibrationDelay(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.noVibrationDelay = buffer[offset];
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
    this.anasysAlertInterval(result, packet.buffer, 4);
    this.anasysNoVibrationDelay(result, packet.buffer, 6);
    this.anasysSensitivity(result, packet.buffer, 7);
    this.anasysDeviceTemperature(result, packet, 8);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysVersion(result, packet.buffer.slice(4, 6).toString("hex"));
    this.anasysAlertInterval(result, packet.buffer, 6);
    this.anasysNoVibrationDelay(result, packet.buffer, 8);
    this.anasysSensitivity(result, packet.buffer, 9);
    this.anasysDeviceTemperature(result, packet, 10);
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysAlertInterval(result, packet.buffer, 4);
    this.anasysNoVibrationDelay(result, packet.buffer, 6);
    this.anasysSensitivity(result, packet.buffer, 7);
    this.anasysDeviceTemperature(result, packet, 8);
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
    this.anasysNoVibrationDelay(result, buffer, 4);
    this.anasysSensitivity(result, buffer, 5);
    this.anasysLoraInfo(result);
  }

  _anasysFromPacket() {
    var result = { type: "vibrationSensor" };
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

  setOpenRemind(request) {
    let buffer = Buffer.from([0, 39, 255, 255, 255, 255]);
    if (request.params && request.params.alertInterval != null) buffer.writeInt16BE(request.params.alertInterval, 2);
    if (request.params && request.params.noVibrationDelay != null) buffer[4] = request.params.noVibrationDelay;
    if (request.params && request.params.sensitivity != null) buffer[5] = request.params.sensitivity;
    return buffer;
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

module.exports = { VibrationSensor };
