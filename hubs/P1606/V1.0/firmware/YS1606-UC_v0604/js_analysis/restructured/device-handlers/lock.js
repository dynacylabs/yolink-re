// Original webpack module: 68948 (Lock) - a PIN-code lock, distinct from
// P7616Register (also a lock family, CommandRegister pattern) and
// LockV2/"MFLock" (HTTP-API layer only, no LoRa handler found in this
// pass). Notably this is the only handler in the bundle with
// `needWakeUp = true` set in its constructor.
const { DataPacket } = require("../data-packet");

// Encodes a JS Date into the lock's 4-byte compact date format
// (year-since-2000, month, day, hour), adjusted for local timezone.
function encodeCompactDate(buffer, timestamp, offset) {
  if (timestamp) {
    var date = new Date(timestamp + 60000 * new Date().getTimezoneOffset());
    buffer[offset] = date.getFullYear() % 100;
    buffer[offset + 1] = date.getMonth();
    buffer[offset + 2] = date.getDate();
    buffer[offset + 3] = date.getHours() % 100;
  }
}

function decodeCompactDate(buffer, offset) {
  var date = new Date();
  date.setFullYear(2000 + buffer[offset]);
  date.setMonth(buffer[offset + 1]);
  date.setDate(buffer[offset + 2]);
  date.setHours(buffer[offset + 3]);
  date.setMinutes(0 - date.getTimezoneOffset());
  date.setSeconds(0);
  return date;
}

// Reads a NUL-terminated ASCII string from buffer[start:end).
function readCString(buffer, start, end) {
  var i;
  for (i = start; i < end && i < buffer.length && buffer[i] != 0; i++);
  return buffer.toString("ascii", start, i);
}

class Lock extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.needWakeUp = true;
  }

  anasysFactoryReset(result, packet) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysState(result, stateByte) {
    result.data = result.data || {};
    result.data.state = ["error", "unlocked", "locked", "error"][stateByte] || "error";
  }

  anasysBattery(result, byte) {
    result.data = result.data || {};
    result.data.battery = byte || 0;
  }

  anasysRLSet(result, byte) {
    result.data = result.data || {};
    result.data.rlSet = byte ? "left" : "right";
  }

  anasysVersion(result, versionHex) {
    if (versionHex) {
      result.data = result.data || {};
      result.data.version = versionHex || 0;
    }
  }

  // Alert source/reason classification - includes which password slot
  // (admin/visitor/userN) was used to unlock, when relevant.
  anasysAlertType(result, buffer, offset) {
    result.data = result.data || {};
    switch (buffer[offset]) {
      case 1:
        result.data.alertType = "unlock";
        result.data.source = "app";
        break;
      case 2:
        result.data.alertType = "unlock";
        result.data.source = "pwd";
        var slot = buffer[offset + 1];
        result.data.user = slot == 0 ? "admin" : slot == 1 ? "visitor" : "user" + (slot - 2);
        break;
      case 3:
        result.data.alertType = "unlock";
        result.data.source = "manual";
        break;
      case 4:
        result.data.alertType = "bell";
        break;
      case 5:
        result.data.alertType = "pwderror";
        break;
      case 6:
        result.data.alertType = "batteryLow";
    }
  }

  anasysTimeZone(result, buffer, offset) {
    result.data = result.data || {};
    if (buffer.length > offset) result.data.tz = buffer.readInt8(offset);
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

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysRLSet(result, packet.buffer[4]);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysRLSet(result, packet.buffer[4]);
    this.anasysTimeZone(result, packet.buffer, 5);
    this.anasysVersion(result, packet.buffer.slice(6, 8).toString("hex"));
    this.anasysLoraInfo(result);
  }

  anasysAlert(result, packet) {
    result.method = "Alert";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysAlertType(result, packet.buffer, 4);
    this.anasysLoraInfo(result);
  }

  // Only "unlock" (1) or "lock" (2) sub-codes at byte 3 update the
  // decoded state; sub-code 0 (presumably "no-op"/ack) decodes nothing.
  anasysSetState(result, buffer) {
    result.method = "setState";
    switch (buffer[3]) {
      case 0:
        break;
      case 1:
      case 2:
        this.anasysState(result, buffer[2]);
        this.anasysLoraInfo(result);
    }
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.anasysState(result, packet.buffer[2]);
    this.anasysBattery(result, packet.buffer[3]);
    this.anasysRLSet(result, packet.buffer[4]);
    this.anasysLoraInfo(result);
  }

  anasysSetTimeZone(result, packet) {
    result.method = "setTimeZone";
    this.anasysTimeZone(result, packet.buffer, 2);
  }

  // Opcode 48 multiplexes user/password-slot management by a sub-opcode
  // at buffer[2] - getUsers, addTemporaryPWD, addPassword, delPassword,
  // updatePassword, clearPassword all share this one wire opcode.
  anasysPWDManage(result, packet) {
    switch (this.buffer[2]) {
      case 1:
        this.anasysGetUsers(result, packet);
        break;
      case 2:
        result.method = "addTemporaryPWD";
        result.data = { success: this.buffer[3] == 0 };
        break;
      case 3:
        result.method = "addPassword";
        result.data = { success: this.buffer[3] < 30, index: this.buffer[3] };
        break;
      case 4:
        result.method = "delPassword";
        result.data = { success: this.buffer[3] < 30, index: this.buffer[3] };
        break;
      case 5:
        result.method = "updatePassword";
        result.data = { success: this.buffer[3] < 30, index: this.buffer[3] };
        break;
      case 6:
        result.method = "clearPassword";
        result.data = { success: this.buffer[3] == 0 };
    }
    return result;
  }

  // FINDING: PIN codes come back partially masked - first and last digit
  // shown, everything in between replaced with asterisks
  // (`pwd[0] + "****...*" + pwd[last]`) - not fully redacted, and the
  // masking is done purely for display; the actual stored value already
  // passed through the LoRa link in the clear when it was first set (see
  // genAddPWD/genUpdatePWD below, which just Buffer.write() the raw PIN
  // string with no encryption of its own beyond whatever the LoRaWAN
  // session already provides).
  anasysGetUsers(result, packet) {
    result.method = "getUsers";
    var page = { offset: this.buffer[3], limit: this.buffer[4], total: this.buffer[5], items: [] };
    for (var offset = 6; offset < this.buffer.length; offset += 17) {
      var pwd = readCString(this.buffer, offset + 9, offset + 17);
      page.items.push({
        index: this.buffer[offset],
        start: decodeCompactDate(this.buffer, offset + 1),
        end: decodeCompactDate(this.buffer, offset + 5),
        pwd: pwd ? pwd[0] + "****************".substring(0, pwd.length - 2) + pwd[pwd.length - 1] : null,
      });
    }
    result.data = page;
  }

  anasysGetVersion(result, buffer) {
    result.method = "getVersion";
    result.data = result.data || {};
    result.data.version = buffer[3].toString() + buffer[2].toString();
    result.data.model = buffer[5].toString() + buffer[4].toString();
  }

  _anasysFromPacket() {
    var result = { type: "lock" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result, this); break;
      case 129: this.anasysSC(result, this); break;
      case 40: this.anasysAlert(result, this); break;
      case 26: this.anasysSetState(result, this.buffer); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 48: this.anasysPWDManage(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 36: this.anasysSetTimeZone(result, this);
    }
    return result;
  }

  genSetState(request) {
    var bytes = [0, 26];
    bytes.push(request.params && request.params.state && request.params.state == "unlock" ? 1 : 2);
    return Buffer.from(bytes);
  }

  genGetState() {
    return Buffer.from([0, 23]);
  }

  // [sic] - "LastState" here is capitalized, unlike every other device
  // handler's identical initState map (which uses "lastState").
  genSetInitState(request) {
    var bytes = [0, 11];
    bytes.push({ open: 85, close: 136, LastState: 170, get: 0 }[request.params.initState]);
    return Buffer.from(bytes);
  }

  genGetVersion() {
    return Buffer.from([0, 22]);
  }

  genGetUsers(request) {
    var offset = request.params.offset || 0;
    var limit = request.params.limit;
    return Buffer.from([0, 48, 1, offset, limit]);
  }

  genAddTemporaryPWD(request) {
    var pwd = request.params.pwd;
    var buffer = Buffer.from([0, 48, 2, 0, 0, 0, 0]);
    buffer.write(pwd, 3, 4);
    return buffer;
  }

  // Command-family header 12291 (0x003003) packed into the first 3
  // bytes, then the raw PIN string, then encoded start/end dates.
  genAddPWD(request) {
    var pwd = request.params.pwd;
    var start = request.params.start || 0;
    var end = request.params.end || 0;
    var buffer = Buffer.alloc(19);
    buffer.writeUIntBE(12291, 0, 3);
    buffer.write(pwd, 3, 8);
    encodeCompactDate(buffer, start, 11);
    encodeCompactDate(buffer, end, 15);
    return buffer;
  }

  genDeletePWD(request) {
    var pwd = request.params.pwd;
    var buffer = Buffer.alloc(11);
    buffer.writeUIntBE(12292, 0, 3);
    if (typeof pwd === "number" || /^\d{1,2}$/.test(pwd)) {
      Buffer.from([255, 255, parseInt(pwd), 0, 0, 0, 0, 0]).copy(buffer, 3);
    } else {
      buffer.write(pwd, 3, 8);
    }
    return buffer;
  }

  genUpdatePWD(request) {
    var oldPwd = request.params.oldPwd;
    var pwd = request.params.pwd;
    var start = request.params.start || 0;
    var end = request.params.end || 0;
    var buffer = Buffer.alloc(27);
    buffer.writeUIntBE(12293, 0, 3);
    if (typeof oldPwd === "number" || /^\d{1,2}$/.test(oldPwd)) {
      Buffer.from([255, 255, parseInt(oldPwd), 0, 0, 0, 0, 0]).copy(buffer, 3);
    } else {
      buffer.write(oldPwd, 3, 8);
    }
    encodeCompactDate(buffer, start, 11);
    encodeCompactDate(buffer, end, 15);
    buffer.write(pwd, 19, 8);
    return buffer;
  }

  genClearPWD() {
    return Buffer.from([0, 48, 6]);
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
      if (action == "setInitState") return this.genSetInitState(request);
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "getUsers") return this.genGetUsers(request);
      if (action == "addTemporaryPWD") return this.genAddTemporaryPWD(request);
      if (action == "addPassword") return this.genAddPWD(request);
      if (action == "delPassword") return this.genDeletePWD(request);
      if (action == "updatePassword") return this.genUpdatePWD(request);
      if (action == "clearPassword") return this.genClearPWD();
      if (action == "setTimeZone") return this.genSetTimeZone(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Lock };
