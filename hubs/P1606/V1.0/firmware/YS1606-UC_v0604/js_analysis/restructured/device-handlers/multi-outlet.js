// Original webpack module: 32960 (MultiOutlet) - a multi-channel (up to
// 8) power strip / outlet controller. Frame layout depends on the
// device's model number ("6801" gets a different, narrower layout than
// every other model in the family).
const { DataPacket } = require("../data-packet");

class MultiOutlet extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  // One bit per channel (up to 8 channels).
  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = [];
    for (var ch = 0; ch < 8; ch++) result.data.state.push(stateByte & (1 << ch) ? "open" : "closed");
  }

  anasysDelay(result, buffer, offset, count, chBase) {
    result.data = result.data || {};
    result.data.delays = [];
    for (var i = 0; i < count; i++) {
      result.data.delays.push({
        ch: i + chBase,
        on: (buffer[offset + 4 * i + 0] << 8) + buffer[offset + 4 * i + 1],
        off: (buffer[offset + 4 * i + 2] << 8) + buffer[offset + 4 * i + 3],
      });
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

  // Model "6801" has a fixed 4-channel delay table starting at offset 3,
  // with channel numbers offset by 1; every other model reads the delay
  // channel count from buffer[3] itself, starting at offset 4.
  #layoutFor(packet) {
    if (packet.appInfo?.deviceModel == "6801") return { offset: 3, count: 4, chBase: 1 };
    return { offset: 4, count: packet.buffer[3], chBase: 0 };
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    var layout = this.#layoutFor(packet);
    if (packet.buffer.length >= layout.offset + layout.count) {
      this.anasysDelay(result, packet.buffer, layout.offset, layout.count, layout.chBase);
    }
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    var layout = this.#layoutFor(packet);
    this.anasysState(result, packet.buffer[2]);
    this.anasysDelay(result, packet.buffer, layout.offset, layout.count, layout.chBase);
    const versionOffset = layout.offset + 4 * layout.count;
    this.anasysVersion(result, packet.buffer.slice(versionOffset, versionOffset + 2).toString("hex"));
    this.anasysTimeZone(result, packet.buffer, versionOffset + 8);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, buffer) {
    result.method = "setState";
    this.anasysState(result, buffer[2]);
    this.anasysLoraInfo(result);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    var layout = this.#layoutFor(packet);
    this.anasysState(result, packet.buffer[2]);
    this.anasysDelay(result, packet.buffer, layout.offset, layout.count, layout.chBase);
    const versionOffset = layout.offset + 4 * layout.count;
    this.anasysVersion(result, packet.buffer.slice(versionOffset, versionOffset + 2).toString("hex"));
    this.anasysTimeZone(result, packet.buffer, versionOffset + 8);
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

  // Up to 10 slots (more than most other schedulable devices), 7 bytes
  // each, each slot carrying its own channel number.
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    for (let slot = 0; slot < 10; slot++) {
      var base = 2 + 7 * slot;
      var week = buffer[base + 1];
      if (week) {
        result.data[slot] = {
          isValid: !!buffer[base],
          week,
          index: slot,
          ch: buffer[base + 2],
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

  // [sic] - stub, no field decoding.
  anssysSetDelayOnOff(result, buffer) {
    result.method = "setDelay";
    result.data = result.data || {};
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
    var result = { type: "multiOutlet" };
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
      case 36: this.anasysSetTimeZone(result, this);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26];
    bytes.push(request.params.chs || 255);
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

  // Packs up to 8 channels' on/off delays into a fixed-size 23-byte
  // buffer: byte 2 is a per-channel presence bitmask, then 5 bytes per
  // channel starting at index (5*ch - 2). Model "6802" gets its channel
  // numbers bumped by 1 before packing.
  genSetDelay(request) {
    var bytes = [0, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (request.params && request.params.delays && request.params.delays.length) {
      request.params.delays.forEach((entry) => {
        if (this.appInfo?.deviceModel == "6802" && entry && entry.ch !== undefined) entry.ch = entry.ch + 1;
        if (entry && entry.ch) {
          bytes[2] = bytes[2] | (1 << (entry.ch - 1));
          if (entry.on != null) {
            bytes[5 * entry.ch - 2] = 1 | bytes[5 * entry.ch - 2];
            bytes[5 * entry.ch - 1] = entry.on >> 8;
            bytes[5 * entry.ch] = 255 & entry.on;
          }
          if (entry.off != null) {
            bytes[5 * entry.ch - 2] = 2 | bytes[5 * entry.ch - 2];
            bytes[5 * entry.ch + 1] = entry.off >> 8;
            bytes[5 * entry.ch + 2] = 255 & entry.off;
          }
        }
      });
    }
    return Buffer.from(bytes);
  }

  genSetTimeZone(request) {
    var buffer = Buffer.from([0, 36, 0]);
    buffer.writeInt8(parseInt(request.params.tz), 2);
    return buffer;
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  genSetSchedule(request) {
    var bytes = [];
    var mask = 0;
    for (let slot = 0; slot < 10; slot++) {
      if (request.params.sches[slot]) {
        mask |= 1 << slot;
        if (request.params.sches[slot].isValid === undefined) request.params.sches[slot].isValid = true;
        bytes.push(request.params.sches[slot].isValid ? 1 : 0);
        bytes.push(request.params.sches[slot].week);
        bytes.push(request.params.sches[slot].ch);
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].on.split(":")[1]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].off.split(":")[1]));
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0]);
      }
    }
    // 16-bit mask (10 slots need more than 8 bits), big-endian, unlike
    // every other schedule encoder in this bundle which uses an 8-bit mask.
    return Buffer.from([0, 35].concat([mask >> 8, 255 & mask]).concat(bytes));
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
      if (action == "setTimeZone") return this.genSetTimeZone(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { MultiOutlet };
