// Original webpack module: 5935 (Siren)
// DataPacket-subclass pattern (see door-sensor.js). Opcode table:
// 129 StatusChange, 40 Alert, 131 Report, 26 setState, 22 getVersion,
// 23 getState, 34 getSchedules, 35 setSchedules, 36 setTimeZone,
// 39 setDuation [sic], 41 setMute.

const { DataPacket } = require("../data-packet");

// Reads a 16-bit "duration" field, clamping the vendor's own
// magic-max-value 65534 up to the wire-protocol's 65535 ("no timeout").
function readDuration(buffer, offset) {
  var value = buffer.readUInt16BE(offset);
  return value >= 65534 ? 65535 : value;
}

class Siren extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = ["normal", "alert", "off"][stateByte] || "off";
  }

  // Low nibble = battery level (0-15), high nibble non-zero means
  // externally powered (USB) rather than battery.
  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = 15 & byte;
    result.data.powerSupply = (byte || 0) > 15 ? "usb" : "battery";
  }

  anasysSoundLevel(result, byte) {
    result.data = result.data || {};
    result.data.soundLevel = 15 & byte;
    result.data.mute = (byte || 0) > 15;
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

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    result.data.alarmDuation = readDuration(packet.buffer, 5); // [sic] "alarmDuation"
    this.anasysVersion(result, packet.buffer.slice(7, 9).toString("hex"));
    // A StatusChange envelope is always attributed to a physical button
    // press, not a network-originated command.
    result.producer = { type: "Manual", channel: "Button", endpointId: "" };
    this.anasysLoraInfo(result);
  }

  // Alert frames optionally carry a 5-byte trailing DevEUI suffix
  // identifying the P2P-paired device that actually triggered the siren
  // (see lora-packet-codec.js's P2P table codec) - the offset differs by
  // one byte depending on total frame length (14 vs 15 bytes), suggesting
  // an optional field earlier in the frame on some firmware versions.
  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    result.data.alarmDuation = readDuration(packet.buffer, 5);
    this.anasysVersion(result, packet.buffer.slice(7, 9).toString("hex"));
    if (packet.buffer.length >= 15) {
      let suffix = Buffer.alloc(5);
      packet.buffer.copy(suffix, 0, 10, 15);
      result.producer = { type: "YLDevice", channel: "P2P", endpointId: "d88b4c" + suffix.toString("hex") };
    } else if (packet.buffer.length >= 14) {
      let suffix = Buffer.alloc(5);
      packet.buffer.copy(suffix, 0, 9, 14);
      result.producer = { type: "YLDevice", channel: "P2P", endpointId: "d88b4c" + suffix.toString("hex") };
    }
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    result.data.alarmDuation = readDuration(packet.buffer, 5);
    this.anasysVersion(result, packet.buffer.slice(7, 9).toString("hex"));
    if (packet.buffer.length >= 14) {
      result.data.muteDuration = packet.buffer.readUInt16BE(10);
      result.data.muteRemaining = packet.buffer.readUInt16BE(12);
    }
    this.anasysTimeZone(result, packet.buffer, 14);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer[2]);
    this.anasysLoraInfo(result);
  }

  anasysSetDuation(result, buffer) { // [sic]
    result.method = "setDuation";
    result.data = result.data || {};
    result.data.alarmDuation = readDuration(buffer, 2);
    this.anasysLoraInfo(result);
  }

  anasysSetMute(result, buffer) {
    result.method = "setMute";
    result.data = result.data || {};
    result.data.mute = buffer[2] == 1;
    result.data.muteDuration = buffer.readUInt16BE(3);
    if (buffer.length >= 7) result.data.muteRemaining = buffer.readUInt16BE(5);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysSoundLevel(result, packet.buffer[3]);
    this.anasysBattery(result, packet.buffer[4]);
    result.data.alarmDuation = readDuration(packet.buffer, 5);
    this.anasysVersion(result, packet.buffer.slice(7, 9).toString("hex"));
    if (packet.buffer.length >= 14) {
      result.data.muteDuration = packet.buffer.readUInt16BE(10);
      result.data.muteRemaining = packet.buffer.readUInt16BE(12);
    }
    this.anasysTimeZone(result, packet.buffer, 14);
    this.anasysLoraInfo(result);
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  // Up to 6 weekly on/off schedule slots, 9 bytes each starting at
  // offset 2. supportSeconds is hardcoded true for this device (unlike
  // switch-register.js's variable-length on/off time strings).
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    for (let slot = 0; slot < 6; slot++) {
      var base = 2 + 9 * slot;
      var week = buffer[base + 1];
      if (week) {
        let isValid = (15 & buffer[base]) > 0;
        result.data[slot] = {
          isValid,
          week,
          index: slot,
          on: buffer[base + 3] + ":" + buffer[base + 4] + ":" + buffer[base + 5],
          off: buffer[base + 6] + ":" + buffer[base + 7] + ":" + buffer[base + 8],
        };
      }
    }
    if (!result.data.supportSeconds) result.data.supportSeconds = true;
  }

  anasysGetSchedule(result, buffer) {
    result.method = "getSchedules";
    this.anasysScheduleInfo(result, buffer);
  }

  anasysSetSchedule(result, buffer) {
    result.method = "setSchedules";
    this.anasysScheduleInfo(result, buffer);
  }

  anasysSetTimeZone(result, packet) {
    result.method = "setTimeZone";
    this.anasysTimeZone(result, packet.buffer, 2);
  }

  _anasysFromPacket() {
    var result = { type: "siren" };
    switch (this.buffer[1]) {
      case 129: this.anasysSC(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 26: this.anasysSetState(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this); break;
      case 39: this.anasysSetDuation(result, this.buffer); break;
      case 41: this.anasysSetMute(result, this.buffer);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26];
    bytes.push(request.params && request.params.state && request.params.state.alarm ? 1 : 0);
    return Buffer.from(bytes);
  }

  genSetDuation(request) { // [sic]
    var buffer = Buffer.from([0, 39, 0, 0, 255]);
    if (request.params && request.params.alarmDuation != null) {
      if (request.params.alarmDuation == 65535) buffer.writeUInt16BE(65534, 2);
      else buffer.writeUInt16BE(request.params.alarmDuation, 2);
    } else {
      buffer.writeUInt16BE(65535, 2);
    }
    return buffer;
  }

  genSetMute(request) {
    var buffer = Buffer.from([0, 41, 255, 255, 255]);
    if (request.params && request.params.mute != null) buffer[2] = request.params.mute ? 1 : 0;
    if (request.params && request.params.muteDuration != null) buffer.writeUInt16BE(request.params.muteDuration, 3);
    return buffer;
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
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
        let on = request.params.sches[slot].on || "25:0";
        let off = request.params.sches[slot].off || "25:0";
        bytes.push(parseInt(on.split(":")[0]));
        bytes.push(parseInt(on.split(":")[1]));
        bytes.push(parseInt(on.split(":")[2]));
        bytes.push(parseInt(off.split(":")[0]));
        bytes.push(parseInt(off.split(":")[1]));
        bytes.push(parseInt(off.split(":")[2]));
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      }
    }
    return Buffer.from([0, 35].concat([mask]).concat(bytes));
  }

  genFactoryReset() {
    return Buffer.from([0, 4, 255, 255]);
  }

  genSetTimeZone(request) {
    var buffer = Buffer.from([0, 36, 0]);
    buffer.writeInt8(parseInt(request.params.tz), 2);
    return buffer;
  }

  _generateFromBRDP(request) {
    if (request && request.method) {
      var action = request.method.split(".")[1];
      if (action == "setState") return this.genSetState(request);
      if (action == "getState") return this.genGetState();
      if (action == "getVersion") return this.genGetVersion();
      if (action == "getSchedules") return this.genGetSchedule();
      if (action == "setSchedules") return this.genSetSchedule(request);
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "setDuation") return this.genSetDuation(request); // [sic]
      if (action == "setMute") return this.genSetMute(request);
      if (action == "setTimeZone") return this.genSetTimeZone(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Siren };
