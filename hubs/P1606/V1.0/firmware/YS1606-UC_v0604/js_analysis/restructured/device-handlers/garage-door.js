// Original webpack module: 71198 (GarageDoor)
const { DataPacket } = require("../data-packet");

class GarageDoor extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = stateByte ? "open" : "closed";
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

  // [sic] - StatusChange decodes no fields at all besides loraInfo.
  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysVersion(result, packet.buffer.slice(2, 4).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 4);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer[2]);
    result.data.stateChangedAt = new Date().getTime();
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysVersion(result, packet.buffer.slice(2, 4).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 4);
    this.anasysLoraInfo(result);
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

  // 6 slots, 7 bytes each starting at offset 2 - a different (older?)
  // layout than switch-register.js's 6x9-byte schedule table, keyed by
  // day-of-week (buffer[offset+2]) rather than sequential slot index.
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    for (let slot = 0; slot < 6; slot++) {
      var base = 2 + 7 * slot;
      var week = buffer[base + 1];
      if (week) {
        result.data[buffer[base + 2]] = {
          isValid: !!buffer[base],
          week,
          index: slot,
          on: buffer[base + 3] + ":" + buffer[base + 4],
          off: buffer[base + 5] + ":" + buffer[base + 6],
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

  anssysSetDelayOnOff(result, buffer) { // [sic] "anssys"
    result.method = "setDelay";
    result.data = result.data || {};
    result.data.ch = buffer[2];
    var flags = buffer[3];
    if ((1 & flags) > 0) result.data.delayOn = (buffer[4] << 8) + buffer[5];
    if ((2 & flags) > 0) result.data.delayOff = (buffer[6] << 8) + buffer[7];
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
  }

  _anasysFromPacket() {
    var result = { type: "garageDoor" };
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
      case 35: this.anasysSetSchedule(result, this.buffer);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26, 1];
    bytes.push(request.params && request.params.state && request.params.state == "open" ? 1 : 0);
    return Buffer.from(bytes);
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genSetInitState(request) {
    var bytes = [0, 11];
    bytes.push({ open: 85, close: 136, lastState: 170, get: 0 }[request.params.initState]);
    return Buffer.from(bytes);
  }

  genSetDelay(request) {
    var bytes = [0, 29, 1];
    var flags = 0;
    var extra = [];
    if (request.params.delayOn != null) {
      flags |= 1;
      extra.push(request.params.delayOn >> 8, request.params.delayOn % 256);
    }
    if (request.params.delayOff != null) {
      flags |= 2;
      extra.push(request.params.delayOff >> 8, request.params.delayOff % 256);
    }
    bytes.push(flags);
    return Buffer.from(bytes.concat(extra));
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  // Iterates slots 1-6 (not 0-5, unlike most other schedule encoders in
  // this bundle) - kept faithful.
  genSetSchedule(request) {
    var bytes = [];
    var mask = 0;
    for (let slot = 1; slot < 7; slot++) {
      if (request.params.sches[slot]) {
        mask |= 1 << (slot - 1);
        if (request.params.sches[slot].isValid === undefined) request.params.sches[slot].isValid = true;
        bytes.push(request.params.sches[slot].isValid ? 1 : 0);
        bytes.push(request.params.sches[slot].week);
        bytes.push(1);
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[1]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[1]));
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0]);
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
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { GarageDoor };
