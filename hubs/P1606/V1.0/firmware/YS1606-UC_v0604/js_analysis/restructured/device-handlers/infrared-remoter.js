// Original webpack module: 46127 (InfraredRemoter) - the IR-blaster
// device, see the writeup's §1.
const { DataPacket } = require("../data-packet");

class InfraredRemoter extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  // Up to 64 "learned" IR key slots, one bit each, packed 16 bits (2
  // bytes) per group of 16 keys.
  anasysKeys(result, buffer) {
    result.data = result.data || {};
    result.data.keys = [];
    for (var i = 0; i < 64; i++) {
      var bitInGroup = 15 & i;
      result.data.keys.push((buffer[2 * (i >> 4) + (bitInGroup >> 3)] & (1 << (bitInGroup % 8))) > 0);
    }
  }

  // A key ID is split across two nibbles at consecutive byte offsets.
  anasysButtonKey(buffer, offset) {
    return (buffer[offset] << 4) + buffer[offset + 1];
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

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysBattery(result, packet.buffer[2]);
    var offset = 3;
    if (packet.buffer.length > 12) {
      this.anasysKeys(result, packet.buffer.slice(offset, (offset += 8)));
    }
    this.anasysVersion(result, packet.buffer.slice(offset, (offset += 2)).toString("hex"));
    this.anasysDatetime(result, packet.buffer, offset);
    offset += 6;
    if (packet.buffer.length >= offset + 1) this.anasysTimeZone(result, packet.buffer, offset);
    this.anasysLoraInfo(result);
  }

  // opcode 21 covers both learn (163=started/etc responses) and send
  // (176/177 responses) - dispatched by a sub-opcode at buffer[2].
  anasysIRSend(result, buffer) {
    result.method = "send";
    result.data = result.data || {};
    result.data.key = this.anasysButtonKey(buffer, 3);
    result.data.success = buffer[5] == 176;
    if (!result.data.success && buffer[5] === 177) result.data.errorCode = "notLearn";
  }

  anasysIRLearn(result, buffer) {
    result.method = "learn";
    result.data = result.data || {};
    result.data.key = this.anasysButtonKey(buffer, 3);
    result.data.success = buffer[5] == 160;
    if (!result.data.success) {
      switch (buffer[5]) {
        case 161: result.data.errorCode = "error"; break;
        case 162: result.data.errorCode = "keyError"; break;
        case 163: result.data.errorCode = "started"; break;
        case 164: result.data.errorCode = "timeout";
      }
    }
    // A "started" learn response is treated as a pending, not-yet-final
    // sequence - the caller presumably waits for a follow-up event.
    if (result.data.errorCode == "started") {
      result.seq = result.seq || {};
      result.seq.pendding = true; // [sic] "pendding"
    }
  }

  anasysIRControl(result, buffer) {
    if (buffer[2] == 21) this.anasysIRLearn(result, buffer);
    else if (buffer[2] == 31) this.anasysIRSend(result, buffer);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysBattery(result, packet.buffer[2]);
    var offset = 3;
    if (packet.buffer.length > 12) {
      this.anasysKeys(result, packet.buffer.slice(offset, (offset += 8)));
    }
    this.anasysVersion(result, packet.buffer.slice(offset, (offset += 2)).toString("hex"));
    this.anasysDatetime(result, packet.buffer, offset);
    offset += 6;
    if (packet.buffer.length >= offset + 1) this.anasysTimeZone(result, packet.buffer, offset);
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

  // Up to 10 slots, 6 bytes each, each carrying its own learned-key ID.
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    for (let slot = 0; slot < 10; slot++) {
      var base = 2 + 6 * slot;
      var week = buffer[base + 1];
      if (week) {
        result.data[slot] = {
          isValid: !!buffer[base],
          week,
          index: slot,
          time: buffer[base + 2] + ":" + buffer[base + 3],
          key: this.anasysButtonKey(buffer, base + 4),
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

  _anasysFromPacket() {
    var result = { type: "infraredRemoter" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result); break;
      case 131: this.anasysReport(result, this); break;
      case 21: this.anasysIRControl(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this);
    }
    return result;
  }

  // [sic] - defined but not reachable from _generateFromBRDP's dispatch
  // below (no "setState" case is wired there).
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

  // [sic] - also dead, not wired into _generateFromBRDP.
  genSetInitState(request) {
    var bytes = [0, 11];
    bytes.push({ open: 85, close: 136, lastState: 170, get: 0 }[request.params.initState]);
    return Buffer.from(bytes);
  }

  // [sic] - also dead.
  genSetDelay(request) {
    var bytes = [0, 29, 1];
    if (request.params.delayOn != null) bytes.push(1, request.params.delayOn >> 8, request.params.delayOn % 256);
    else if (request.params.delayOff != null) bytes.push(0, request.params.delayOff >> 8, request.params.delayOff % 256);
    return Buffer.from(bytes);
  }

  // [sic] - also dead.
  genSetOpenRemind(request) {
    var bytes = [0, 39];
    if (request.params && request.params.delay != null) bytes.push(request.params.delay);
    return Buffer.from(bytes);
  }

  genGetSchedule() {
    return Buffer.from([0, 34]);
  }

  // The leading byte 69 (0x45) on IR send/learn commands is a fixed
  // marker/sub-command-group byte, not part of the usual [0, opcode, ...]
  // shape every other command in this bundle uses.
  genIRSend(request) {
    var bytes = [69, 21, 31, request.params.key >> 4, 15 & request.params.key];
    return Buffer.from(bytes);
  }

  genIRLearn(request) {
    var bytes = [69, 21, 21, request.params.key >> 4, 15 & request.params.key];
    return Buffer.from(bytes);
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
        bytes.push(parseInt(request.params.sches[slot].time.split(":")[0]));
        bytes.push(parseInt(request.params.sches[slot].time.split(":")[1]));
        bytes.push(request.params.sches[slot].key >> 4);
        bytes.push(15 & request.params.sches[slot].key);
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0]);
      }
    }
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
      if (action == "getState") return this.genGetState();
      if (action == "getSchedules") return this.genGetSchedule();
      if (action == "setSchedules") return this.genSetSchedule(request);
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "setTimeZone") return this.genSetTimeZone(request);
      if (action == "send") return this.genIRSend(request);
      if (action == "learn") return this.genIRLearn(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { InfraredRemoter };
