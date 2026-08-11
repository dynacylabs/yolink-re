// Original webpack module: 23561 (Dimmer)
const { DataPacket } = require("../data-packet");

class Dimmer extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) {
      let byte = buffer[offset];
      let isOpen = (1 & byte) > 0;
      let highLoad = (2 & byte) > 0, lowLoad = (4 & byte) > 0, overload = (8 & byte) > 0, highTemperature = (16 & byte) > 0;
      result.data.state = isOpen ? "open" : "closed";
      result.data.alertType = { highLoad, lowLoad, overload, highTemperature };
    }
    if (buffer.length > offset + 1) result.data.brightness = buffer[offset + 1];
  }

  anasysDelay(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset + 4) {
      result.data.delay = result.data.delay || {};
      result.data.delay.on = (buffer[offset] << 8) + buffer[offset + 1];
      result.data.delay.off = (buffer[offset + 2] << 8) + buffer[offset + 3];
      result.data.delay.brightness = buffer[offset + 4];
    }
  }

  anasysDatetime(result, buffer, offset) {
    var year = buffer[offset], month = buffer[offset + 1] + 1, day = buffer[offset + 2];
    var hour = buffer[offset + 3], minute = buffer[offset + 4], second = buffer[offset + 5];
    if (year && year >= 68) year -= 48;
    result.data.time = new Date(`20${year}/${month}/${day} ${hour}:${minute}:${second}`);
  }

  anasysLoraInfo(result) {
    if (this.loraInfo) {
      result.data = result.data || {};
      result.data.loraInfo = this.loraInfo;
    }
  }

  anasysVersion(result, buffer, offset) {
    if (buffer.length > offset + 2) {
      result.data = result.data || {};
      result.data.version = buffer.slice(offset, offset + 2).toString("hex");
      result.data.moduleVersion = buffer[offset + 2].toString();
    }
  }

  anasysTimeZone(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.tz = buffer.readInt8(offset);
  }

  anasysSettings(result, buffer, offset) {
    result.data = result.data || {};
    result.data.deviceAttributes = {
      gradient: { on: buffer[offset], off: buffer[offset + 1] },
      led: { status: buffer[offset + 2] == 1 ? "on" : "off", level: buffer[offset + 3] == 1 ? "on" : "off" },
      calibration: buffer[offset + 4],
    };
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer, 2);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer, 2);
    this.anasysSettings(result, packet.buffer, 4);
    this.anasysDelay(result, packet.buffer, 9);
    this.anasysVersion(result, packet.buffer, 14);
    this.anasysDatetime(result, packet.buffer, 17);
    this.anasysTimeZone(result, packet.buffer, 23);
    if (packet.buffer.length >= 28) result.data.deviceAttributes.calibrationHigh = packet.buffer[27];
    if (packet.buffer.length >= 44) {
      result.data.power = packet.buffer.readUInt32BE(28);
      result.data.watt = packet.buffer.readUInt32BE(32);
      result.data.powerLimitHigh = packet.buffer.readUInt32BE(36);
      result.data.powerLimitLow = packet.buffer.readUInt32BE(40);
    }
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer, 2);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer, 2);
    this.anasysSettings(result, packet.buffer, 4);
    this.anasysDelay(result, packet.buffer, 9);
    this.anasysVersion(result, packet.buffer, 14);
    this.anasysDatetime(result, packet.buffer, 17);
    this.anasysTimeZone(result, packet.buffer, 23);
    if (packet.buffer.length >= 28) result.data.deviceAttributes.calibrationHigh = packet.buffer[27];
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    result.data = result.data || {};
    this.anasysState(result, packet.buffer, 2);
    if (packet.buffer.length >= 5) result.data.alertType.highTemperature = (4 & packet.buffer[4]) > 0;
    this.anasysLoraInfo(result);
  }

  anasysSetTimeZone(result, packet) {
    result.method = "setTimeZone";
    this.anasysTimeZone(result, packet.buffer, 2);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetInitState(result, buffer) {
    result.method = "setInitState";
    result.data = result.data || {};
    result.data.initState = { 85: "open", 136: "close", 170: "lastState" }[buffer[2]];
  }

  // 6 slots, 8 bytes each (adds a per-slot brightness byte vs
  // garage-door.js's 7-byte layout).
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    for (let slot = 0; slot < 6; slot++) {
      var base = 2 + 8 * slot;
      var week = buffer[base + 1];
      if (week) {
        result.data[slot] = {
          isValid: !!buffer[base],
          week,
          index: slot,
          on: buffer[base + 3] + ":" + buffer[base + 4],
          off: buffer[base + 5] + ":" + buffer[base + 6],
          brightness: buffer[base + 7],
        };
      }
    }
  }

  anasysGetSchedule(result, buffer) {
    result.method = "getSchedules";
    this.anasysScheduleInfo(result, buffer);
  }

  anasysSetSchedule(result, buffer) {
    result.method = "setSchedules";
    this.anasysScheduleInfo(result, buffer);
  }

  anssysSetDelayOnOff(result, buffer) { // [sic]
    result.method = "setDelay";
    result.data = result.data || {};
    var flags = buffer[2];
    if ((1 & flags) > 0) result.data.delayOn = (buffer[3] << 8) + buffer[4];
    if ((2 & flags) > 0) result.data.delayOff = (buffer[5] << 8) + buffer[6];
    result.data.brightness = buffer[7];
  }

  anasysSetAlarm(result, packet) {
    result.method = "setAlarm";
    result.data = result.data || {};
    result.data.powerLimitHigh = packet.buffer.readUInt32BE(3);
    result.data.powerLimitLow = packet.buffer.readUInt32BE(7);
  }

  anasysPowerReport(result, buffer) {
    result.method = "powerReport";
    result.data = result.data || {};
    var now = new Date();
    result.data.watts = [];
    result.data.watts.push({ time: now.getTime(), watt: (buffer[2] << 24) + (buffer[3] << 16) + (buffer[4] << 8) + buffer[5] });
    result.data.watts.push({ time: now.getTime() - 3600000, watt: (buffer[6] << 24) + (buffer[7] << 16) + (buffer[8] << 8) + buffer[9] });
    result.data.watts.push({ time: now.getTime() - 7200000, watt: (buffer[10] << 24) + (buffer[11] << 16) + (buffer[12] << 8) + buffer[13] });
    result.data.watts.push({ time: now.getTime() - 10800000, watt: (buffer[14] << 24) + (buffer[15] << 16) + (buffer[16] << 8) + buffer[17] });
    if (buffer.length >= 42) {
      result.data.wattPerHours = [];
      for (var i = 0; i < 12; i++) {
        result.data.wattPerHours.push({ time: now.getTime() + 5 * (i - 12) * 60 * 1000, watt: buffer.readUInt16BE(18 + 2 * i) });
      }
    }
  }

  anasysSetDeviceAttr(result, buffer) {
    result.method = "setDeviceAttributes";
    result.data = result.data || {};
    this.anasysSettings(result, buffer, 2);
    if (buffer.length >= 8) result.data.deviceAttributes.calibrationHigh = buffer[7];
  }

  _anasysFromPacket() {
    var result = { type: "Dimmer" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result); break;
      case 129: this.anasysSC(result, this); break;
      case 130: this.anasysPowerReport(result, this.buffer); break;
      case 131: this.anasysReport(result, this); break;
      case 26: this.anasysSetState(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 11: this.anasysSetInitState(result, this.buffer); break;
      case 29: this.anssysSetDelayOnOff(result, this.buffer); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this); break;
      case 39: this.anasysSetDeviceAttr(result, this.buffer); break;
      case 40: this.anasysAlert(result, this); break;
      case 41: this.anasysSetAlarm(result, this);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26];
    bytes.push(request.params && request.params.state && request.params.state == "open" ? 1 : 0);
    if (request.params && request.params.brightness != null) bytes.push(request.params.brightness);
    else bytes.push(255);
    return Buffer.from(bytes);
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetTimeZone(request) {
    var buffer = Buffer.from([0, 36, 0]);
    buffer.writeInt8(parseInt(request.params.tz), 2);
    return buffer;
  }

  genSetInitState(request) {
    var bytes = [0, 11];
    bytes.push({ open: 85, close: 136, lastState: 170, get: 0 }[request.params.initState]);
    return Buffer.from(bytes);
  }

  genSetDelay(request) {
    var bytes = [0, 29];
    var flags = 0;
    var extra = [];
    if (request.params.delayOn != null) {
      flags |= 1;
      extra.push(request.params.delayOn >> 8, request.params.delayOn % 256);
    } else {
      extra.push(0, 0);
    }
    if (request.params.delayOff != null) {
      flags |= 2;
      extra.push(request.params.delayOff >> 8, request.params.delayOff % 256);
    } else {
      extra.push(0, 0);
    }
    if (request.params.brightness) extra.push(request.params.brightness);
    else extra.push(255);
    bytes.push(flags);
    return Buffer.from(bytes.concat(extra));
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  genSetSchedule(request) {
    var bytes = [];
    var mask = 0;
    for (let slot = 0; slot < 6; slot++) {
      if (request.params.sches[slot]) {
        mask |= 1 << slot;
        if (request.params.sches[slot].isValid === undefined) request.params.sches[slot].isValid = true;
        bytes.push(request.params.sches[slot].isValid ? 1 : 0);
        bytes.push(request.params.sches[slot].week);
        bytes.push(1);
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[1]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[1]));
        bytes.push(request.params.sches[slot].brightness ?? 255);
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0, 255]);
      }
    }
    return Buffer.from([0, 35].concat([mask]).concat(bytes));
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  genSetDeviceAttrs(request) {
    var bytes = [0, 39];
    bytes.push(request.params?.gradient?.on ?? 255);
    bytes.push(request.params?.gradient?.off ?? 255);
    bytes.push(request.params?.led?.status == null ? 255 : request.params?.led?.status == "on" ? 1 : 0);
    bytes.push(request.params?.led?.level == null ? 255 : request.params?.led?.level == "on" ? 1 : 0);
    bytes.push(request.params?.calibration ?? 255);
    bytes.push(request.params?.calibrationHigh ?? 255);
    return Buffer.from(bytes);
  }

  genSetAlarm(request) {
    var buffer = Buffer.from([0, 41, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
    if (request.params.powerLimitHigh != null) buffer.writeUInt32BE(request.params.powerLimitHigh, 3);
    if (request.params.powerLimitLow != null) buffer.writeUInt32BE(request.params.powerLimitLow, 7);
    return buffer;
  }

  _generateFromBRDP(request) {
    if (request && request.method) {
      var action = request.method.split(".")[1];
      if (action == "setState") return this.genSetState(request);
      if (action == "getState") return this.genGetState();
      if (action == "setInitState") return this.genSetInitState(request);
      if (action == "getSchedules") return this.genGetSchedule();
      if (action == "setSchedules") return this.genSetSchedule(request);
      if (action == "setDelay") return this.genSetDelay(request);
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "setTimeZone") return this.genSetTimeZone(request);
      if (action == "setDeviceAttributes") return this.genSetDeviceAttrs(request);
      if (action == "setAlarm") return this.genSetAlarm(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Dimmer };
