// Original webpack module: 30897 (Thermostat) - the largest/most
// field-dense DataPacket handler in the bundle. Report/getState grow a
// long tail of optional trailing fields (properties, remote sensors,
// P2P hash) gated purely by total buffer length, not any version/model
// check - later firmware just appends more bytes.
const { DataPacket } = require("../data-packet");

const MODES = ["off", "auto", "cool", "heat"];
const FAN_MODES = ["auto", "on"];
const SCHEDULE_MODES = ["run", "hold"];
const ECO_MODES = ["off", "on"];
const RUNNING_STATES = ["idle", "cool", "heat"];

function indexOfOr(list, value, fallback) {
  for (var i = 0; i < list.length; i++) if (list[i] == value) return i;
  return fallback;
}

function atOrUndefined(list, index) {
  if (index >= 0 && index < list.length) return list[index];
}

class Thermostat extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  // Low 2 bits = current running state (idle/cool/heat); higher bits are
  // auxiliary-heat/second-stage/demand-response flags. Assumes
  // result.data.state already exists (set up by the caller).
  anasysState(result, byte) {
    result.data = result.data || {};
    result.data.state.running = atOrUndefined(RUNNING_STATES, 3 & byte);
    result.data.state.other = {
      auxiliaryHeat: (8 & byte) > 0,
      secondStage: (16 & byte) > 0,
      drRunning: (32 & byte) > 0,
    };
  }

  anasysDelay(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer[offset]) {
      result.data.delay = result.data.delay || {};
      result.data.delay.ch = buffer[offset];
      result.data.delay.on = (buffer[offset + 1] << 8) + buffer[offset + 2];
      result.data.delay.off = (buffer[offset + 3] << 8) + buffer[offset + 4];
    }
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

  anasysTimeZone(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.tz = buffer.readInt8(offset);
  }

  // The core 22-byte state block shared verbatim by StatusChange,
  // Report, setState, and getState.
  #decodeCoreState(result, packet) {
    result.data = { state: {}, setting: {}, eco: {} };
    result.data.state.tempMode = packet.buffer[2] == 0 ? "c" : "f";
    result.data.tempCorrection = packet.buffer.readInt8(3) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(4) / 10;
    result.data.state.temperature = packet.buffer.readInt16BE(5) / 10;
    result.data.state.humidity = packet.buffer.readInt16BE(7);
    result.data.state.lowTemp = packet.buffer.readInt8(10) / 2;
    result.data.state.highTemp = packet.buffer.readInt8(9) / 2;
    result.data.state.mode = atOrUndefined(MODES, packet.buffer[11]);
    result.data.state.fan = atOrUndefined(FAN_MODES, packet.buffer[12]);
    result.data.state.sche = atOrUndefined(SCHEDULE_MODES, packet.buffer[13]);
    result.data.eco.mode = atOrUndefined(ECO_MODES, packet.buffer[14]);
    result.data.eco.highTemp = packet.buffer[15] / 10;
    result.data.eco.lowTemp = packet.buffer[16] / 10;
    this.anasysState(result, packet.buffer[17]);
    this.anasysVersion(result, packet.buffer.slice(18, 20).toString("hex"));
    this.anasysTimeZone(result, packet.buffer, 20);
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.#decodeCoreState(result, packet);
    this.anasysLoraInfo(result);
  }

  // Report grows a long tail of optional "properties" and remote-sensor
  // fields, each gated on total buffer length - later firmware just
  // appends more bytes without any version negotiation.
  anasysReport(result, packet) {
    result.method = "Report";
    this.#decodeCoreState(result, packet);
    if (packet.buffer.length >= 26) {
      result.data.properties = {
        minRuntime: packet.buffer.readUInt8(21),
        coolLimit: packet.buffer.readInt16BE(22) / 10,
        heatLimit: packet.buffer.readInt16BE(24) / 10,
      };
    }
    if (packet.buffer.length >= 29) {
      result.data.properties.mute = packet.buffer[26] == 1;
      result.data.properties.menuLock = packet.buffer[27] == 1;
      result.data.properties.auxStandby = packet.buffer[28];
    }
    if (packet.buffer.length >= 34) {
      result.data.properties.auxMaxSpan = packet.buffer[29];
      result.data.properties.auxThreshold = packet.buffer[30] / 10;
      result.data.properties.stage2Standby = packet.buffer[31];
      result.data.properties.stage2MaxSpan = packet.buffer[32];
      result.data.properties.stage2Threshold = packet.buffer[33] / 10;
    }
    if (packet.buffer.length >= 39) {
      result.data.properties.master = ["local", "sensor1", "sensor2"][packet.buffer[34]];
      result.data.state.sensor1 = { temperature: packet.buffer.readInt16BE(35) / 10 };
      result.data.state.sensor2 = { temperature: packet.buffer.readInt16BE(37) / 10 };
    }
    if (packet.buffer.length >= 40) result.data.loraP2PHash = packet.buffer.readUInt8(39);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, packet) {
    result.method = "setState";
    this.#decodeCoreState(result, packet);
    this.anasysLoraInfo(result);
  }

  // getState's remote-sensor decode differs subtly from Report's: a
  // sentinel raw value of 61166 (0xEEEE) means "no sensor reading",
  // mapped to `null` here - Report above doesn't do this sentinel check
  // at all, so a disconnected sensor there would show a large bogus
  // temperature instead.
  anasysGetState(result, packet) {
    result.method = "getState";
    this.#decodeCoreState(result, packet);
    if (packet.buffer.length >= 26) {
      result.data.properties = {
        minRuntime: packet.buffer.readUInt8(21),
        coolLimit: packet.buffer.readInt16BE(22) / 10,
        heatLimit: packet.buffer.readInt16BE(24) / 10,
      };
    }
    if (packet.buffer.length >= 29) {
      result.data.properties.mute = packet.buffer[26] == 1;
      result.data.properties.menuLock = packet.buffer[27] == 1;
      result.data.properties.auxStandby = packet.buffer[28];
    }
    if (packet.buffer.length >= 34) {
      result.data.properties.auxMaxSpan = packet.buffer[29];
      result.data.properties.auxThreshold = packet.buffer[30] / 10;
      result.data.properties.stage2Standby = packet.buffer[31];
      result.data.properties.stage2MaxSpan = packet.buffer[32];
      result.data.properties.stage2Threshold = packet.buffer[33] / 10;
    }
    if (packet.buffer.length >= 39) {
      result.data.properties.master = ["local", "sensor1", "sensor2"][packet.buffer[34]];
      let sensor1Raw = packet.buffer.readInt16BE(35);
      let sensor2Raw = packet.buffer.readInt16BE(37);
      result.data.state.sensor1 = { temperature: sensor1Raw == 61166 ? null : sensor1Raw / 10 };
      result.data.state.sensor2 = { temperature: sensor2Raw == 61166 ? null : sensor2Raw / 10 };
    }
    this.anasysLoraInfo(result);
  }

  // NOTE: original module defines anasysGetECO with method = "setECO"
  // (not "getECO") - identical body to anasysSetECO otherwise. Kept
  // exactly as shipped.
  anasysSetECO(result, packet) {
    result.method = "setECO";
    result.data = { eco: {} };
    result.data.eco.mode = atOrUndefined(ECO_MODES, packet.buffer[2]);
    result.data.eco.lowTemp = packet.buffer.readInt8(4) / 10;
    result.data.eco.highTemp = packet.buffer.readInt8(3) / 10;
    if (packet.buffer.length >= 10) {
      result.data.eco.startTime = packet.buffer[5] + ":" + packet.buffer[6];
      result.data.eco.stopTime = packet.buffer[7] + ":" + packet.buffer[8];
      result.data.eco.maxSpan = packet.buffer[9];
    }
    this.anasysLoraInfo(result);
  }

  anasysGetECO(result, packet) { // [sic] method label is "setECO", matching anasysSetECO exactly
    result.method = "setECO";
    result.data = { eco: {} };
    result.data.eco.mode = atOrUndefined(ECO_MODES, packet.buffer[2]);
    result.data.eco.lowTemp = packet.buffer.readInt8(4) / 10;
    result.data.eco.highTemp = packet.buffer.readInt8(3) / 10;
    if (packet.buffer.length >= 10) {
      result.data.eco.startTime = packet.buffer[5] + ":" + packet.buffer[6];
      result.data.eco.stopTime = packet.buffer[7] + ":" + packet.buffer[8];
      result.data.eco.maxSpan = packet.buffer[9];
    }
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

  // 7 days x 4 daily periods, 4 bytes per period (time HH:MM +
  // low/high temp in half-degree units).
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || { sches: [] };
    for (var day = 0; day < 7; day++) {
      let periods = [];
      for (var period = 0; period < 4; period++) {
        var base = 2 + 16 * day + 4 * period;
        periods.push({
          time: buffer[base] + ":" + buffer[base + 1],
          lowTemp: buffer[base + 3] / 2,
          highTemp: buffer[base + 2] / 2,
        });
      }
      result.data.sches.push(periods);
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

  // Up to 10 demand-response (DR) events, 8 bytes each - a Unix-second
  // start time, a duration, and a temperature adjustment. Slots with a
  // zero start time are skipped entirely (not represented at all in the
  // output, not even as invalid).
  anasysDRScheduleInfo(result, buffer) {
    result.data = result.data || { sches: {} };
    let offset = 2;
    for (var slot = 0; slot < 10; slot++) {
      let isValid = (15 & buffer[offset]) > 0;
      let startTimeSec = buffer.readUInt32BE(offset + 1);
      let duration = buffer.readUInt16BE(offset + 5);
      let adjust = buffer[offset + 7] / 10;
      if (startTimeSec != 0) {
        result.data.sches[slot] = { index: slot, isValid, startTime: 1000 * startTimeSec, duration, adjust };
      }
      offset += 8;
    }
  }

  anasysGetDRSchedule(result, buffer) {
    result.method = "getDREvents";
    this.anasysDRScheduleInfo(result, buffer);
  }

  anasysSetDRSchedule(result, buffer) {
    result.method = "setDREvents";
    this.anasysDRScheduleInfo(result, buffer);
  }

  anasysSetProperties(result, buffer) {
    result.method = "setProperties";
    result.data = result.data || {};
    result.data.minRuntime = buffer.readUInt8(2);
    result.data.coolLimit = buffer.readInt16BE(3) / 10;
    result.data.heatLimit = buffer.readInt16BE(5) / 10;
    if (buffer.length >= 10) {
      result.data.mute = buffer[7] == 1;
      result.data.menuLock = buffer[8] == 1;
      result.data.auxStandby = buffer[9];
    }
    if (buffer.length >= 15) {
      result.data.auxMaxSpan = buffer[10];
      result.data.auxThreshold = buffer[11] / 10;
      result.data.stage2Standby = buffer[12];
      result.data.stage2MaxSpan = buffer[13];
      result.data.stage2Threshold = buffer[14] / 10;
    }
    if (buffer.length >= 16) result.data.master = ["local", "sensor1", "sensor2"][buffer[15]];
  }

  anasysSetCalibration(result, packet) {
    result.method = "setCorrection";
    result.data = result.data || {};
    result.data.tempMode = packet.buffer[2] == 0 ? "c" : "f";
    result.data.tempCorrection = packet.buffer.readInt8(2) / 10;
    result.data.humidityCorrection = packet.buffer.readInt8(3) / 10;
  }

  _anasysFromPacket() {
    var result = { type: "thermostat" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result); break;
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 50: this.anasysSetState(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this); break;
      case 39: this.anasysSetProperties(result, this.buffer); break;
      case 41: this.anasysSetCalibration(result, this); break;
      case 48: this.anasysSetECO(result, this); break;
      case 51: this.anasysGetECO(result, this); break;
      case 53: this.anasysGetDRSchedule(result, this.buffer); break;
      case 54: this.anasysSetDRSchedule(result, this.buffer);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 50];
    if (request.params && request.params.mode != null) bytes.push(indexOfOr(["off", "auto", "cool", "heat"], request.params.mode, 255));
    else bytes.push(255);
    if (request.params && request.params.sche != null) bytes.push(indexOfOr(["run", "hold"], request.params.sche, 255));
    else bytes.push(255);
    if (request.params && request.params.fan != null) bytes.push(indexOfOr(["auto", "on"], request.params.fan, 255));
    else bytes.push(255);
    if (request.params && request.params.highTemp != null) bytes.push(Math.round(2 * request.params.highTemp));
    else bytes.push(255);
    if (request.params && request.params.lowTemp != null) bytes.push(Math.round(2 * request.params.lowTemp));
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

  genSetProperties(request) {
    var buffer = Buffer.from([0, 39, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
    if (request.params && request.params.minRuntime != null) buffer.writeUInt8(request.params.minRuntime, 2);
    if (request.params && request.params.coolLimit != null) buffer.writeInt16BE(10 * request.params.coolLimit, 3);
    if (request.params && request.params.heatLimit != null) buffer.writeInt16BE(10 * request.params.heatLimit, 5);
    if (request.params && request.params.mute != null) buffer[7] = request.params.mute ? 1 : 0;
    if (request.params && request.params.menuLock != null) buffer[8] = request.params.menuLock ? 1 : 0;
    if (request.params && request.params.auxStandby != null) buffer[9] = request.params.auxStandby;
    if (request.params && request.params.auxMaxSpan != null) buffer[10] = request.params.auxMaxSpan;
    if (request.params && request.params.auxThreshold != null) buffer[11] = Math.floor(10 * request.params.auxThreshold);
    if (request.params && request.params.stage2Standby != null) buffer[12] = request.params.stage2Standby;
    if (request.params && request.params.stage2MaxSpan != null) buffer[13] = request.params.stage2MaxSpan;
    if (request.params && request.params.stage2Threshold != null) buffer[14] = Math.floor(10 * request.params.stage2Threshold);
    if (request.params && request.params.master != null) buffer[15] = indexOfOr(["local", "sensor1", "sensor2"], request.params.master, 255);
    return buffer;
  }

  genSetCorrection(request) {
    var buffer = Buffer.from([0, 41, 255, 255, 255]);
    if (request.params.tempMode != null) buffer[2] = request.params.tempMode == "c" ? 0 : 1;
    if (request.params.temperature != null) buffer.writeInt8(10 * request.params.temperature, 3);
    if (request.params.humidity != null) buffer.writeInt8(10 * request.params.humidity, 4);
    return buffer;
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  genSetSchedule(request) {
    var bytes = [0, 35];
    var appendPeriod = (period) => {
      if (period) {
        let timeParts = period.time.split(":");
        bytes.push(parseInt(timeParts[0]), parseInt(timeParts[1]), Math.round(2 * period.highTemp), Math.round(2 * period.lowTemp));
      } else {
        bytes = bytes.concat([0, 0, 0, 0]);
      }
    };
    for (var day = 0; day < 7; day++) {
      for (var period = 0; period < 4; period++) {
        appendPeriod(request.params.sches[day % 7] ? request.params.sches[day % 7][period] : null);
      }
    }
    return Buffer.from(bytes);
  }

  genGetDRSchedule() {
    return Buffer.from([0, 53]);
  }

  genSetDRSchedule(request) {
    var buffer = Buffer.alloc(83, 0);
    var mask = 0;
    buffer[0] = 0;
    buffer[1] = 54;
    buffer[2] = 0;
    buffer[3] = 0;
    for (var slot = 0; slot < 10; slot++) {
      if (request.params.sches[slot]) {
        mask |= 1 << slot;
        if (request.params.sches[slot].isValid === undefined) request.params.sches[slot].isValid = true;
        var base = 8 * slot + 4;
        buffer[base] = request.params.sches[slot].isValid ? 1 : 0;
        buffer.writeUInt32BE(request.params.sches[slot].startTime / 1000, base + 1);
        buffer.writeUInt16BE(request.params.sches[slot].duration, base + 5);
        buffer.writeInt8(10 * request.params.sches[slot].adjust, base + 7);
      }
    }
    buffer.writeUInt16BE(mask, 2);
    return buffer;
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  genSetECO(request) {
    var bytes = [0, 48];
    if (request.params && request.params.mode != null) bytes.push(indexOfOr(["off", "on"], request.params.mode, 255));
    else bytes.push(255);
    if (request.params && request.params.highTemp != null) bytes.push(Math.floor(10 * request.params.highTemp));
    else bytes.push(255);
    if (request.params && request.params.lowTemp != null) bytes.push(Math.floor(10 * request.params.lowTemp));
    else bytes.push(255);
    if (request.params && request.params.startTime != null) {
      var startParts = request.params.startTime.split(":");
      bytes.push(parseInt(startParts[0]), parseInt(startParts[1]));
    } else {
      bytes.push(255, 255);
    }
    if (request.params && request.params.stopTime != null) {
      var stopParts = request.params.stopTime.split(":");
      bytes.push(parseInt(stopParts[0]), parseInt(stopParts[1]));
    } else {
      bytes.push(255, 255);
    }
    if (request.params && request.params.maxSpan != null) bytes.push(request.params.maxSpan);
    else bytes.push(255);
    return Buffer.from(bytes);
  }

  genGetECO() {
    return Buffer.from([0, 51]);
  }

  _generateFromBRDP(request) {
    if (request && request.method) {
      var action = request.method.split(".")[1];
      if (action == "setState") return this.genSetState(request);
      if (action == "getState") return this.genGetState();
      if (action == "setInitState") {
        // [sic] - dead branch, recognized but no handler wired
      } else {
        if (action == "getSchedules") return this.genGetSchedule();
        if (action == "setSchedules") return this.genSetSchedule(request);
        if (action == "setDelay") {
          // [sic] - also dead
        } else {
          if (action == "getVersion") return this.genGetVersion();
          if (action == "factoryReset") return this.genFactoryReset();
          if (action == "setTimeZone") return this.genSetTimeZone(request);
          if (action == "setProperties") return this.genSetProperties(request);
          if (action == "setCorrection") return this.genSetCorrection(request);
          if (action == "setECO") return this.genSetECO(request);
          if (action == "getECO") return this.genGetECO();
          if (action == "getDREvents") return this.genGetDRSchedule();
          if (action == "setDREvents") return this.genSetDRSchedule(request);
        }
      }
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Thermostat };
