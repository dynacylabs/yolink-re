// Original webpack module: 77801 (Manipulator) - a mechanical valve/
// switch actuator, with the most product-variant branching of any
// handler in this bundle (battery reporting and P2P hash presence both
// depend on the AppEUI's embedded product-number substring).
const { DataPacket } = require("../data-packet");

class Manipulator extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = stateByte ? "open" : "closed";
    if (stateByte == 3) {
      result.data.state = "open";
      result.data.alertType = "openRemind";
    } else if (stateByte == 4) {
      result.data.state = "error";
      result.data.alertType = "error";
    } else {
      result.data.alertType = undefined;
    }
    if (stateByte == 2) result.data.state = "error";
  }

  // A single on/off delay slot (channel is hardcoded to 1) - byte at
  // `offset` selects whether the following 2-byte value is the on-delay
  // or off-delay.
  anasysDelay(result, buffer, offset) {
    result.data = result.data || {};
    result.data.delay = result.data.delay || {};
    result.data.delay.ch = 1;
    let value = (buffer[offset + 1] << 8) + buffer[offset + 2];
    if (buffer[offset]) result.data.delay.on = value;
    else result.data.delay.off = value;
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

  anasysOpenRemind(result, byte) {
    result.data = result.data || {};
    result.data.openRemind = byte || 0;
  }

  anasysStateDetection(result, buffer, offset) {
    result.data = result.data || {};
    result.data.stateDetection = {
      enable: buffer[offset] == 1,
      mode: buffer[offset] == 1 ? "L5" : "L2",
      alertInterval: buffer[offset + 1],
    };
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysLoraInfo(result);
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = 15 & (byte || 0);
    result.data.powerSupply = (byte || 0) > 15 ? "PowerLine" : "battery";
  }

  // Battery field is only present for product keys with AppEUI byte-3
  // "50" or byte-4 "09" - other variants skip straight to the delay
  // field, shifting every subsequent offset by one byte.
  anasysReport(result, packet) {
    result.method = "Report";
    var appEUIByte3 = packet?.appInfo?.appEUI?.substring(6, 8);
    var appEUIByte4 = packet?.appInfo?.appEUI?.substring(8, 10);
    var hasBatteryField = appEUIByte4 == "09" || appEUIByte3 == "50";
    var offset = 3;
    this.anasysState(result, packet.buffer[2]);
    if (hasBatteryField) {
      this.anasysBattery(result, packet.buffer[offset]);
      offset++;
    }
    this.anasysDelay(result, packet.buffer, offset);
    this.anasysOpenRemind(result, packet.buffer[offset + 3]);
    this.anasysVersion(result, packet.buffer.slice(offset + 4, offset + 6).toString("hex"));
    this.anasysDatetime(result, packet.buffer, offset + 6);
    if (packet.buffer.length >= offset + 12) this.anasysTimeZone(result, packet.buffer, offset + 12);
    if (packet.buffer.length >= offset + 17) this.anasysStateDetection(result, packet.buffer, offset + 16);
    if (appEUIByte3 == "50" && (appEUIByte4 == "02" || appEUIByte4 == "12") && packet.buffer.length >= 23) {
      result.data.loraP2PHash = packet.buffer[22];
    }
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer[2]);
    this.anasysLoraInfo(result);
  }

  // getState's battery-field condition covers a wider set of product
  // keys (byte-4 in {"09","01","02","03","12"}) than anasysReport's
  // condition above - not the same check, kept faithful.
  anasysGetState(result, packet) {
    result.method = "getState";
    var appEUIByte4 = packet?.appInfo?.appEUI?.substring(8, 10);
    var hasBatteryField = ["09", "01", "02", "03", "12"].includes(appEUIByte4);
    var offset = 3;
    this.anasysState(result, packet.buffer[2]);
    if (hasBatteryField) {
      this.anasysBattery(result, packet.buffer[offset]);
      offset++;
    }
    this.anasysDelay(result, packet.buffer, offset);
    this.anasysOpenRemind(result, packet.buffer[offset + 3]);
    this.anasysVersion(result, packet.buffer.slice(offset + 4, offset + 6).toString("hex"));
    this.anasysDatetime(result, packet.buffer, offset + 6);
    if (packet.buffer.length >= offset + 12) this.anasysTimeZone(result, packet.buffer, offset + 12);
    if (packet.buffer.length >= offset + 17) this.anasysStateDetection(result, packet.buffer, offset + 16);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  anasysSetTimeZone(result, packet) {
    result.method = "setTimeZone";
    this.anasysTimeZone(result, packet.buffer, 2);
  }

  // Up to 6 slots, either 7 bytes (minute precision) or 9 bytes (second
  // precision) each depending on a per-schedule flag byte - the wire
  // format's slot width is variable, unlike every other schedule table
  // in this bundle which uses a fixed width throughout.
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    let offset = 2;
    let supportSeconds = false;
    for (let slot = 0; slot < 6; slot++) {
      let week = buffer[offset + 1];
      let isValid = (15 & buffer[offset]) > 0;
      supportSeconds = (240 & buffer[offset]) > 0;
      let on = supportSeconds
        ? buffer[offset + 3] + ":" + buffer[offset + 4] + ":" + buffer[offset + 5]
        : buffer[offset + 3] + ":" + buffer[offset + 4];
      let off = supportSeconds
        ? buffer[offset + 6] + ":" + buffer[offset + 7] + ":" + buffer[offset + 8]
        : buffer[offset + 5] + ":" + buffer[offset + 6];
      if (week) result.data[slot] = { isValid, week, index: slot, on, off };
      offset += supportSeconds ? 9 : 7;
      if (!result.data.supportSeconds) result.data.supportSeconds = supportSeconds;
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

  anasysSetOpenRemind(result, buffer) {
    result.method = "setOpenRemind";
    result.data = result.data || {};
    this.anasysOpenRemind(result, buffer[2]);
  }

  anssysSetDelayOnOff(result, buffer) { // [sic]
    result.method = "setDelay";
    result.data = result.data || {};
    this.anasysDelay(result, buffer, 2);
  }

  _anasysFromPacket() {
    var result = { type: "manipulator" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result); break;
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 26: this.anasysSetState(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 29: this.anssysSetDelayOnOff(result, this.buffer); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this); break;
      case 39: this.anasysSetOpenRemind(result, this.buffer); break;
      case 40: this.anasysAlert(result, this);
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
    var bytes = [0, 29, 1];
    if (request.params.delayOn != null) {
      bytes.push(1, request.params.delayOn >> 8, request.params.delayOn % 256);
    } else if (request.params.delayOff != null) {
      bytes.push(0, request.params.delayOff >> 8, request.params.delayOff % 256);
    }
    return Buffer.from(bytes);
  }

  genSetOpenRemind(request) {
    var bytes = [0, 39];
    if (request.params && request.params.delay != null) bytes.push(request.params.delay);
    else bytes.push(255);
    bytes.push(255);
    if (request.params?.stateDetection?.mode != null) bytes.push(request.params.stateDetection.mode == "L5" ? 1 : 0);
    else bytes.push(255);
    if (request.params?.stateDetection?.alertInterval != null) bytes.push(request.params.stateDetection.alertInterval);
    else bytes.push(255);
    return Buffer.from(bytes);
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  genSetSchedule(request) {
    var bytes = [];
    var mask = 0;
    var supportSeconds = request.params.supportSeconds == 1;
    for (let slot = 0; slot < 6; slot++) {
      if (request.params.sches[slot]) {
        mask |= 1 << slot;
        if (request.params.sches[slot].isValid === undefined) request.params.sches[slot].isValid = true;
        var flags = request.params.sches[slot].isValid ? 1 : 0;
        if (supportSeconds) flags |= 128;
        bytes.push(flags);
        bytes.push(request.params.sches[slot].week);
        bytes.push(1);
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[1]));
        if (supportSeconds) bytes.push(parseInt(request.params.sches[slot].on.split(":")[2]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[1]));
        if (supportSeconds) bytes.push(parseInt(request.params.sches[slot].off.split(":")[2]));
      } else {
        bytes = supportSeconds ? bytes.concat([0, 0, 0, 0, 0, 0, 0, 0, 0]) : bytes.concat([0, 0, 0, 0, 0, 0, 0]);
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
      if (action == "setOpenRemind") return this.genSetOpenRemind(request);
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "setTimeZone") return this.genSetTimeZone(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Manipulator };
