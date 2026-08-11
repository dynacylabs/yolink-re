// Original webpack module: 69164 (Sprinkler) - a 6-zone irrigation
// controller.
const { DataPacket } = require("../data-packet");

class Sprinkler extends DataPacket {
  anasysFactoryReset(result) {
    result.method = "factoryReset";
    result.data = {};
  }

  anasysStateMode(result, modeByte) {
    result.data = result.data || {};
    result.data.state = result.data.state || {};
    result.data.setting = result.data.setting || {};
    result.data.state.mode = ["off", "auto", "manual"][modeByte];
  }

  anasysStateWatering(result, buffer, offset) {
    result.data.state.watering = { zone: buffer[offset], total: buffer[offset + 1], left: buffer[offset + 2] };
  }

  anasysManualWater(result, buffer, offset) {
    result.data.setting.manualWater = [];
    for (var zone = 0; zone < 6; zone++) result.data.setting.manualWater.push(buffer[offset + zone]);
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

  // Every envelope type (SC/Report/setState/setManualWater/getState)
  // decodes exactly the same full state blob - the only difference
  // between them is the `method` label and, for setManualWater, that
  // loraInfo is never attached.
  #decodeFullState(result, packet) {
    this.anasysStateMode(result, packet.buffer[2]);
    result.data.state.zoneSize = packet.buffer[3];
    result.data.setting.maxWaterTime = packet.buffer[4];
    result.data.state.delay = packet.buffer.readUInt16BE(5);
    this.anasysManualWater(result, packet.buffer, 7);
    this.anasysStateWatering(result, packet.buffer, 13);
    this.anasysVersion(result, packet.buffer.slice(16, 18).toString("hex"));
    this.anasysDatetime(result, packet.buffer, 18);
    this.anasysTimeZone(result, packet.buffer, 24);
  }

  anasysSC(result, packet) {
    result.method = "StatusChange";
    this.#decodeFullState(result, packet);
    this.anasysLoraInfo(result);
  }

  anasysReport(result, packet) {
    result.method = "Report";
    this.#decodeFullState(result, packet);
    this.anasysLoraInfo(result);
  }

  anasysSetState(result, packet) {
    result.method = "setState";
    this.#decodeFullState(result, packet);
    this.anasysLoraInfo(result);
  }

  anasysSetWaterState(result, packet) {
    result.method = "setManualWater";
    this.#decodeFullState(result, packet);
  }

  anasysGetState(result, packet) {
    result.method = "getState";
    this.#decodeFullState(result, packet);
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

  // 4 date-specific schedule entries, 19 bytes each, each with a
  // weekday mask and up to 2 daily watering plans (each plan lists a
  // start time plus a per-zone duration for all 6 zones).
  anasysScheduleInfo(result, buffer) {
    result.data = result.data || {};
    result.data.sches = [];
    for (let entryIdx = 0; entryIdx < 4; entryIdx++) {
      var base = 2 + 19 * entryIdx;
      var entry = { date: buffer[base] + "-" + buffer[base + 1], weekmask: buffer[base + 2], plans: [] };
      for (let planIdx = 0; planIdx < 2; planIdx++) {
        var planBase = base + 3 + 8 * planIdx;
        entry.plans.push({
          time: buffer[planBase] + ":" + buffer[planBase + 1] + ":0",
          zones: [
            buffer[planBase + 2], buffer[planBase + 3], buffer[planBase + 4],
            buffer[planBase + 5], buffer[planBase + 6], buffer[planBase + 7],
          ],
        });
      }
      result.data.sches.push(entry);
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

  anasysWaterReport(result, buffer) {
    result.method = "waterReport";
    result.data = {
      type: ["auto", "manual"][buffer[2]],
      delay: buffer.readUInt16BE(3),
      event: ["end", "start", "stop"][buffer[5]],
      step: ["manual", "auto1", "auto2"][buffer[6]],
      zones: buffer.slice(9, 15),
    };
  }

  _anasysFromPacket() {
    var result = { type: "sprinkler" };
    switch (this.buffer[1]) {
      case 4: this.anasysFactoryReset(result); break;
      case 129: this.anasysSC(result, this); break;
      case 131: this.anasysReport(result, this); break;
      case 26: this.anasysSetState(result, this); break;
      case 42: this.anasysSetWaterState(result, this); break;
      case 22: this.anasysGetVersion(result, this.buffer); break;
      case 23: this.anasysGetState(result, this); break;
      case 34: this.anasysGetSchedule(result, this.buffer); break;
      case 35: this.anasysSetSchedule(result, this.buffer); break;
      case 36: this.anasysSetTimeZone(result, this); break;
      case 64: this.anasysWaterReport(result, this.buffer);
    }
    return result;
  }

  genSetWaterState(request) {
    var bytes = [0, 42, 1];
    if (request.params.state) bytes.push(request.params.state == "start" ? 1 : 2);
    return Buffer.from(bytes);
  }

  genSetState(request) {
    var bytes = [0, 26];
    if (request.params.state && request.params.state.mode) {
      switch (request.params.state.mode) {
        case "off": bytes.push(0); break;
        case "auto": bytes.push(1); break;
        case "manual": bytes.push(2); break;
        default: bytes.push(255);
      }
    } else {
      bytes.push(255);
    }
    if (request.params.state && request.params.state.zoneSize != null) bytes.push(request.params.state.zoneSize);
    else bytes.push(255);
    if (request.params.setting && request.params.setting.maxWaterTime != null) bytes.push(request.params.setting.maxWaterTime);
    else bytes.push(255);
    if (request.params.state && request.params.state.delay != null) {
      bytes.push(request.params.state.delay >> 8, 255 & request.params.state.delay);
    } else {
      bytes.push(255, 255);
    }
    if (request.params.setting && request.params.setting.manualWater != null) {
      bytes = bytes.concat(request.params.setting.manualWater);
    } else {
      bytes = bytes.concat([255, 255, 255, 255, 255, 255]);
    }
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

  // [sic] - defined but not wired into _generateFromBRDP's dispatch below.
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

  genSetSchedule(request) {
    var bytes = [];
    var mask = 0;
    for (let entryIdx = 0; entryIdx < 4; entryIdx++) {
      if (request.params.sches[entryIdx]) {
        mask |= 1 << entryIdx;
        var entry = request.params.sches[entryIdx];
        var dateParts = entry.date.split("-");
        bytes.push(parseInt(dateParts[0]), parseInt(dateParts[1]), entry.weekmask);
        for (let planIdx = 0; planIdx < 2; planIdx++) {
          var plan = entry.plans[planIdx];
          if (plan) {
            var timeParts = plan.time.split(":");
            bytes.push(parseInt(timeParts[0]), parseInt(timeParts[1]));
            for (let zoneIdx = 0; zoneIdx < 6; zoneIdx++) bytes.push(plan.zones[zoneIdx] || 0);
          } else {
            bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0, 0]);
          }
        }
      } else {
        bytes = bytes.concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
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
      if (action == "setManualWater") return this.genSetWaterState(request);
      if (action == "getState") return this.genGetState();
      if (action == "getSchedules") return this.genGetSchedule();
      if (action == "setSchedules") return this.genSetSchedule(request);
      if (action == "getVersion") return this.genGetVersion();
      if (action == "factoryReset") return this.genFactoryReset();
      if (action == "setTimeZone") return this.genSetTimeZone(request);
    }
  }

  _getDeviceState(result) {
    if (result && result.data && result.data.loraInfo) return result.data;
  }
}

module.exports = { Sprinkler };
