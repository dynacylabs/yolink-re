// Original webpack module: 98946 (THSensor) - matches sensors/YS8003
// elsewhere in this repo. Several fields (recordInterval,
// screenDuration, loraP2PHash) are only present on specific product
// models (8006/8007/8008/8014/8015/8017), checked via
// appInfo.deviceModel string comparisons throughout.
const { DataPacket } = require("../data-packet");

// Fixed-point tenths-of-a-degree/percent 16-bit signed field, used for
// temperature and humidity readings throughout this handler.
function readTenths(buffer, offset) {
  return buffer.readInt16BE(offset) / 10;
}

class THSensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  anasysFactoryReset(result, packet) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, byte) {
    result.data = result.data || {};
    result.data.state = byte > 0 ? "alert" : "normal";
    result.data.alarm = {
      lowBattery: (1 & byte) > 0,
      lowTemp: (2 & byte) > 0,
      highTemp: (4 & byte) > 0,
      lowHumidity: (8 & byte) > 0,
      highHumidity: (16 & byte) > 0,
      period: (64 & byte) > 0,
      code: byte,
    };
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysCFMode(result, byte) {
    result.data = result.data || {};
    result.data.mode = byte ? "f" : "c";
  }

  anasysBatteryType(result, offset) {
    if (offset != null) {
      result.data = result.data || {};
      result.data.batteryType = this.buffer[offset] ? "Li" : "Al";
    }
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
    this.anasysCFMode(result, packet.buffer[4]);
    this.anasysInterval(result, packet.buffer[5]);
    result.data.temperature = readTenths(packet.buffer, 14);
    result.data.humidity = readTenths(packet.buffer, 16);
    result.data.tempLimit = { max: readTenths(packet.buffer, 6), min: readTenths(packet.buffer, 8) };
    result.data.humidityLimit = { max: readTenths(packet.buffer, 10), min: readTenths(packet.buffer, 12) };
    result.data.tempCorrection = packet.buffer.readInt8(18) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(19) / 10;
    this.anasysVersion(result, packet.buffer.slice(20, 22).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysCFMode(result, packet.buffer[4]);
    this.anasysInterval(result, packet.buffer[5]);
    result.data.temperature = readTenths(packet.buffer, 14);
    result.data.humidity = readTenths(packet.buffer, 16);
    result.data.tempLimit = { max: readTenths(packet.buffer, 6), min: readTenths(packet.buffer, 8) };
    result.data.humidityLimit = { max: readTenths(packet.buffer, 10), min: readTenths(packet.buffer, 12) };
    result.data.tempCorrection = packet.buffer.readInt8(18) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(19) / 10;
    this.anasysVersion(result, packet.buffer.slice(20, 22).toString("hex"));
    if (packet.buffer.length > 24) this.anasysBatteryType(result, packet.buffer[24]);
    var model = packet.appInfo?.deviceModel;
    if (model == "8006" || model == "8014" || model == "8015" || model == "8008") result.data.recordInterval = packet.buffer[25];
    if (model == "8014" || model == "8015" || model == "8008") result.data.screenDuration = packet.buffer[26];
    if ((model == "8007" || model == "8017") && packet.buffer.length >= 27) result.data.loraP2PHash = packet.buffer[26];
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysCFMode(result, packet.buffer[4]);
    result.data.temperature = readTenths(packet.buffer, 5);
    result.data.humidity = readTenths(packet.buffer, 7);
    this.anasysVersion(result, packet.buffer.slice(9, 11).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysCFMode(result, packet.buffer[4]);
    this.anasysInterval(result, packet.buffer[5]);
    result.data.temperature = readTenths(packet.buffer, 14);
    result.data.humidity = readTenths(packet.buffer, 16);
    result.data.tempLimit = { max: readTenths(packet.buffer, 6), min: readTenths(packet.buffer, 8) };
    result.data.humidityLimit = { max: readTenths(packet.buffer, 10), min: readTenths(packet.buffer, 12) };
    result.data.tempCorrection = packet.buffer.readInt8(18) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(19) / 10;
    this.anasysVersion(result, packet.buffer.slice(20, 22).toString("hex"));
    if (packet.buffer.length > 24) this.anasysBatteryType(result, packet.buffer[24]);
    var model = packet.appInfo?.deviceModel;
    if (model == "8006" || model == "8014" || model == "8015" || model == "8008") result.data.recordInterval = packet.buffer[25];
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetAlarm(result, packet) {
    result.method = "setAlarm";
    result.data = result.data || {};
    result.data.interval = packet.buffer[2];
    result.data.tempLimit = { max: readTenths(packet.buffer, 3), min: readTenths(packet.buffer, 5) };
    result.data.humidityLimit = { max: readTenths(packet.buffer, 7), min: readTenths(packet.buffer, 9) };
    this.anasysLoraInfo(result);
  }

  anasysSetProperties(result, packet) {
    result.method = "setProperties";
    result.data = result.data || {};
    this.anasysBatteryType(result, this.buffer[2]);
    this.anasysCFMode(result, this.buffer[3]);
    var model = packet.appInfo?.deviceModel;
    if (model == "8006" || model == "8014" || model == "8015" || model == "8008") result.data.recordInterval = packet.buffer[4];
    if (model == "8014" || model == "8015" || model == "8008") result.data.screenDuration = packet.buffer[5];
    this.anasysLoraInfo(result);
  }

  anasysSetCalibration(result, packet) {
    result.method = "setCorrection";
    result.data = result.data || {};
    result.data.tempCorrection = packet.buffer.readInt8(2) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(3) / 10;
  }

  // A batch of historical temp/humidity samples (module methodology
  // matches sensors/YS8003's on-device data-logging capability).
  anasysTHReport(result, packet) {
    result.method = "DataRecord";
    result.data = result.data || {};
    result.data.records = [];
    var count = packet.buffer[3];
    for (var i = 0; i < count; i++) {
      result.data.records.push({
        temperature: packet.buffer.readInt16BE(4 + 8 * i) / 10,
        humidity: packet.buffer.readInt16BE(6 + 8 * i) / 10,
        time: new Date(1000 * packet.buffer.readUInt32BE(8 + 8 * i)),
      });
    }
    return result;
  }

  _anasysFromPacket() {
    var result = { type: "THSensor" };
    // A specific model (8006) forces Class D (always-listening).
    if (/^d88b4c8006/gi.test(this.appInfo.appEUI)) this.devClassType = "ClassD";
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result, this); break;
      case 129: this.anasysSC(result, this); break;
      case 131:
      case 5:
        this.anasysReport(result, this);
        break;
      case 40: this.anasysAlert(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 39: this.anasysSetAlarm(result, this); break;
      case 37: this.anasysSetProperties(result, this); break;
      case 41: this.anasysSetCalibration(result, this); break;
      case 42: this.anasysTHReport(result, this);
    }
    return result;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genClearDatas() {
    return Buffer.from([0, 5]);
  }

  genSetAlarm(request) {
    if (request.params.interval != null && request.params.tempLimit != null && request.params.humidityLimit != null) {
      var buffer = Buffer.alloc(11);
      buffer[1] = 39;
      buffer[2] = request.params.interval || 0;
      buffer.writeInt16BE(10 * request.params.tempLimit.max, 3);
      buffer.writeInt16BE(10 * request.params.tempLimit.min, 5);
      buffer.writeInt16BE(10 * request.params.humidityLimit.max, 7);
      buffer.writeInt16BE(10 * request.params.humidityLimit.min, 9);
      return buffer;
    }
  }

  genSetProperties(request) {
    if (
      request.params?.mode != null ||
      request.params?.batteryType != null ||
      request.params?.recordInterval != null ||
      request.params?.screenDuration != null
    ) {
      var buffer = Buffer.alloc(6);
      buffer[1] = 37;
      buffer[2] = request.params.batteryType != null ? (request.params.batteryType == "Li" ? 1 : 0) : 255;
      buffer[3] = request.params.mode != null ? (request.params.mode == "f" ? 1 : 0) : 255;
      buffer[4] = request.params.recordInterval != null ? request.params.recordInterval : 255;
      buffer[5] = request.params.screenDuration != null ? request.params.screenDuration : 255;
      return buffer;
    }
  }

  genSetCorrection(request) {
    if (request.params.temperature != null) {
      var buffer = Buffer.from([0, 41, 0, 0]);
      buffer.writeInt8(10 * request.params.temperature, 2);
      buffer.writeInt8(10 * request.params.humidity, 3);
      return buffer;
    }
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

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
    if (action == "setAlarm") return this.genSetAlarm(request);
    if (action == "setProperties") return this.genSetProperties(request);
    if (action == "setCorrection") return this.genSetCorrection(request);
    if (action == "clearDatas") return this.genClearDatas();
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { THSensor };
