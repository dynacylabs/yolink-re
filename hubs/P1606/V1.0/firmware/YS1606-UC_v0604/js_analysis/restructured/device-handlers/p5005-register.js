// Original webpack module: 78025 (P5005Register) - a single-valve
// leak-detector/water-shutoff combo device, registered under product
// key "5005". Internal type string is "WaterLeakController" (distinct
// from water-meter-constants.js's DeviceType/P5029DeviceType strings,
// which this module does NOT use, unlike p5029-register.js).
const { CommandRegister } = require("../lora-packet-codec");

const LEAK_PLANS = ["Auto", "Manual", "AwayAuto", "AwayManual"];

const P5005Register = new CommandRegister("WaterLeakController");

function readValveAndAlarm(bsdp, reader) {
  let flags = reader.readBitFlags();
  bsdp.appandData("state", { valve: flags[0] ? "open" : "close" });
  bsdp.appandData("alarm", {
    openReminder: flags[1],
    valveDetectorError: flags[2],
    leak: flags[3],
    noWaterError: flags[4],
    freezeError: flags[5],
    reminder: flags[6],
    durationOverrun: flags[7],
  });
}

function readBattery(bsdp, reader) {
  let byte = reader.readUInt8();
  bsdp.appandData("battery", 15 & byte);
  bsdp.appandData("powerSupply", (byte || 0) > 15 ? "PowerLine" : "battery");
}

// A single valve-delay slot (channel hardcoded to 1) - a leading
// boolean selects whether the following 16-bit value is an on-delay or
// off-delay.
function readValveDelay(bsdp, reader) {
  let entry = { ch: 1 };
  if (reader.readBoolean()) entry.on = reader.readUInt16();
  else entry.off = reader.readUInt16();
  bsdp.appandData("valveDelay", entry);
}

// Fixed 6-slot weekly valve schedule.
function readValveSchedules(reader, bsdp) {
  for (let slot = 0; slot < 6; slot++) {
    let entry = {
      isValid: reader.readBoolean(),
      week: reader.readUInt8(),
      index: reader.readUInt8(),
      on: reader.readUInt8() + ":" + reader.readUInt8(),
      off: reader.readUInt8() + ":" + reader.readUInt8(),
    };
    entry.index = slot;
    if (entry.week) bsdp.appandData(slot.toString(), entry);
  }
}

// Variable-length (up to 20 slots) leak-monitoring schedule - each
// entry grows an extra 2 bytes (sensitivity/close-valve + standby) if
// the payload is long enough to indicate this firmware "supports leak
// params" (>= 90 bytes remaining at the start of the whole field).
function readLeakSchedules(reader, bsdp) {
  let supportsLeakParams = reader.getRemainingSize() >= 90;
  let slot = 0;
  while (reader.getRemainingSize() >= 7 && slot < 20) {
    let entry = {
      isValid: reader.readBoolean(),
      week: reader.readUInt8(),
      index: reader.readUInt8(),
      on: reader.readUInt8() + ":" + reader.readUInt8(),
      off: reader.readUInt8() + ":" + reader.readUInt8(),
    };
    if (supportsLeakParams) {
      let byte = reader.readUInt8();
      entry.standBy = reader.readUInt8();
      entry.sensivity = 15 & byte; // [sic] "sensivity"
      entry.closeValve = !(byte >> 4);
    }
    entry.index = slot;
    if (entry.week) bsdp.appandData(slot.toString(), entry);
    slot++;
  }
  bsdp.appandData("supportLeakParams", supportsLeakParams);
}

// The shared full-state decoder used by Report and getState.
function decodeFullState(reader, bsdp) {
  readValveAndAlarm(bsdp, reader);
  readBattery(bsdp, reader);
  readValveDelay(bsdp, reader);
  bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
  bsdp.appandData("version", reader.readHexString(2));
  bsdp.appandData("tz", reader.readInt8());
  reader.skip(1);
  bsdp.appandData("attributes", { valveStateDetection: reader.readBoolean(), alertInterval: reader.readUInt8() });
  bsdp.appandData("state", { waterTemp: reader.readInt16() / 100 });
  bsdp.appandData("attributes", {
    leakPlan: LEAK_PLANS[reader.readUInt8()],
    overrunDuration: reader.readUInt16(),
    awayDuration: reader.readUInt8(),
    leakDetector: { dryPipeTemp: reader.readUInt16() / 100, high: reader.readInt16() / 100, low: reader.readInt16() / 100 },
    freezeTemp: reader.readInt16() / 100,
  });
  if (reader.getRemainingSize() >= 2) bsdp.appandData("heaterTemp", reader.readInt16() / 100);
  if (reader.getRemainingSize() >= 5) {
    bsdp.appandData("attributes", { maxOverrunDuration: reader.readUInt8() });
    let maxOverrunByte = reader.readUInt8();
    let awayByte = reader.readUInt8();
    bsdp.appandData("attributes", {
      maxOverrunSensivity: 15 & maxOverrunByte,
      maxOverrunCloseValve: !(maxOverrunByte >> 4),
      awaySensivity: 15 & awayByte,
      awayCloseValve: !(awayByte >> 4),
    });
    bsdp.appandData("muteRemaining", reader.readUInt16());
  }
  if (reader.getRemainingSize() >= 3) bsdp.appandData("attributes", { mute: reader.readBoolean(), muteDuration: reader.readUInt16() });
  if (reader.getRemainingSize() >= 2) bsdp.appandData("state", { waterFlowingDuration: reader.readUInt16() });
  bsdp.appendLoraInfo(reader.getLoraInfo());
}

P5005Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readValveAndAlarm(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

P5005Register.register(
  131,
  "Report",
  (reader, bsdp) => {
    decodeFullState(reader, bsdp);
    if (reader.getRemainingSize() >= 1) bsdp.appandData("loraP2PHash", reader.readUInt8());
  },
  undefined
);

P5005Register.register(
  40,
  "Alert",
  (reader, bsdp) => {
    readValveAndAlarm(bsdp, reader);
    bsdp.appandData("battery", reader.readUInt8());
    bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

P5005Register.register(
  23,
  "getState",
  (reader, bsdp) => decodeFullState(reader, bsdp),
  (req, writer) => {}
);

P5005Register.register(
  26,
  "setState",
  (reader, bsdp) => {
    bsdp.appandData("state", { valve: reader.readInt8() ? "open" : "close" });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    if (req.params.valve) {
      writer.writeInt8(1);
      writer.writeUInt8(req.params.valve == "open" ? 1 : 0);
    }
  }
);

P5005Register.register(
  29,
  "setDelay",
  (reader, bsdp) => readValveDelay(bsdp, reader),
  (req, writer) => {
    writer.writeUInt8(1);
    if (req.params.delayOn) {
      writer.writeUInt8(1);
      writer.writeUInt16(req.params.delayOn);
    }
    if (req.params.delayOff) {
      writer.writeUInt8(0);
      writer.writeUInt16(req.params.delayOff);
    }
  }
);

P5005Register.register(
  34,
  "getValveSchedules",
  (reader, bsdp) => readValveSchedules(reader, bsdp),
  (req, writer) => {}
);

P5005Register.register(
  35,
  "setValveSchedules",
  (reader, bsdp) => readValveSchedules(reader, bsdp),
  (req, writer) => {
    writer.writeInt8(0);
    for (let slot = 0; slot < 6; slot++) {
      const entry = req.params.sches[slot];
      if (entry) {
        writer.byteOr(2, 1 << slot);
        if (entry.isValid === undefined) entry.isValid = true;
        writer.writeUInt8(entry.isValid ? 1 : 0);
        writer.writeUInt8(entry.week);
        writer.writeUInt8(1);
        writer.writeUInt8(parseInt(entry.on.split(":")[0]));
        writer.writeUInt8(parseInt(entry.on.split(":")[1]));
        writer.writeUInt8(parseInt(entry.off.split(":")[0]));
        writer.writeUInt8(parseInt(entry.off.split(":")[1]));
      } else {
        writer.writeNone(7);
      }
    }
  }
);

P5005Register.register(
  36,
  "setTimeZone",
  (reader, bsdp) => {
    bsdp.appandData("tz", reader.readUInt8());
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    writer.writeInt8(req.params.tz);
  }
);

P5005Register.register(
  37,
  "getLeakSchedules",
  (reader, bsdp) => readLeakSchedules(reader, bsdp),
  (req, writer) => {}
);

P5005Register.register(
  38,
  "setLeakSchedules",
  (reader, bsdp) => readLeakSchedules(reader, bsdp),
  (req, writer) => {
    let supportsLeakParams = req.params.supportLeakParams ?? false;
    // Header width itself depends on the flag being encoded: a wider
    // 16-bit slot-presence mask when leak-params are supported, an
    // 8-bit mask otherwise.
    if (supportsLeakParams == 1) writer.writeUInt16(0);
    else writer.writeUInt8(0);
    let slotCount = supportsLeakParams ? 10 : 9;
    let mask = 0;
    for (let slot = 0; slot < slotCount; slot++) {
      if (req.params.sches[slot]) {
        mask |= 1 << slot;
        if (req.params.sches[slot].isValid === undefined) req.params.sches[slot].isValid = true;
        writer.writeUInt8(req.params.sches[slot].isValid ? 1 : 0);
        writer.writeUInt8(req.params.sches[slot].week);
        writer.writeUInt8(1);
        writer.writeUInt8(parseInt(req.params.sches[slot].on.split(":")[0]));
        writer.writeUInt8(parseInt(req.params.sches[slot].on.split(":")[1]));
        writer.writeUInt8(parseInt(req.params.sches[slot].off.split(":")[0]));
        writer.writeUInt8(parseInt(req.params.sches[slot].off.split(":")[1]));
        if (supportsLeakParams) {
          let byte = req.params.sches[slot].sensivity + ((req.params.sches[slot].closeValve ? 0 : 1) << 4);
          writer.writeUInt8(byte);
          writer.writeUInt8(req.params.sches[slot].standBy);
        }
      } else {
        writer.writeNone(supportsLeakParams ? 9 : 7);
      }
    }
    // The slot-presence mask is written retroactively at offset 2,
    // overwriting the placeholder zero(es) written at the top of this
    // function - width again depends on supportsLeakParams.
    if (supportsLeakParams == 1) writer.buffer.writeUint16BE(mask, 2); // [sic] "writeUint16BE" - inconsistent casing vs writeUInt8 just below
    else writer.buffer.writeUInt8(mask, 2);
  }
);

P5005Register.register(
  39,
  "setAttributes",
  (reader, bsdp) => {
    let openReminder = reader.readUInt8();
    reader.skip(1);
    let valveStateDetection = reader.readBoolean();
    let alertInterval = reader.readUInt8();
    bsdp.appandData("attributes", { openReminder, valveStateDetection, alertInterval });
  },
  (req, writer) => {
    writer.writeUInt8(req.params.openReminder);
    writer.writeNone();
    writer.writeBoolean(req.params.valveStateDetection);
    writer.writeUInt8(req.params.alertInterval);
  }
);

P5005Register.register(
  41,
  "setLeakAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", {
      leakPlan: LEAK_PLANS[reader.readUInt8()],
      overrunDuration: reader.readUInt16(),
      awayDuration: reader.readUInt8(),
      leakDetector: { dryPipeTemp: reader.readUInt16() / 100, high: reader.readInt16() / 100, low: reader.readInt16() / 100 },
      freezeTemp: reader.readInt16() / 100,
    });
    if (reader.getRemainingSize() >= 8) {
      bsdp.appandData("attributes", { maxOverrunDuration: reader.readUInt8() });
      let maxOverrunByte = reader.readUInt8();
      let awayByte = reader.readUInt8();
      bsdp.appandData("attributes", {
        maxOverrunSensivity: 15 & maxOverrunByte,
        maxOverrunCloseValve: !(maxOverrunByte >> 4),
        awaySensivity: 15 & awayByte,
        awayCloseValve: !(awayByte >> 4),
        mute: reader.readBoolean(),
        muteDuration: reader.readUInt16(),
        muteRemaining: reader.readUInt16(),
      });
    }
  },
  (req, writer) => {
    writer.writeIndex(LEAK_PLANS, req.params.leakPlan);
    writer.writeUInt16(req.params.overrunDuration);
    writer.writeUInt8(req.params.awayDuration);
    writer.writeUInt16(req.params.leakDetector?.dryPipeTemp == null ? undefined : 100 * req.params.leakDetector.dryPipeTemp);
    writer.writeUInt16(req.params.leakDetector?.high == null ? undefined : 100 * req.params.leakDetector.high);
    writer.writeUInt16(req.params.leakDetector?.low == null ? undefined : 100 * req.params.leakDetector.low);
    writer.writeUInt16(req.params.freezeTemp == null ? undefined : 100 * req.params.freezeTemp);
    writer.writeUInt8(req.params.maxOverrunDuration);

    let maxOverrunByte = 255;
    if (req.params.maxOverrunSensivity != null) maxOverrunByte &= 240 + req.params.maxOverrunSensivity;
    if (req.params.maxOverrunCloseValve != null) maxOverrunByte &= 15 + ((req.params.maxOverrunCloseValve ? 0 : 1) << 4);
    writer.writeUInt8(maxOverrunByte);

    let awayByte = 255;
    if (req.params.awaySensivity != null) awayByte &= 240 + req.params.awaySensivity;
    if (req.params.awayCloseValve != null) awayByte &= 15 + ((req.params.awayCloseValve ? 0 : 1) << 4);
    writer.writeUInt8(awayByte);

    writer.writeBoolean(req.params.mute);
    writer.writeUInt16(req.params.muteDuration);
    writer.writeUInt16(req.params.muteRemaining);
  }
);

P5005Register.register(
  48,
  "clearAlarmState",
  (reader, bsdp) => readValveAndAlarm(bsdp, reader),
  (req, writer) => {
    writer.writeBitFlags([req.params?.leak ? 3 : -1, req.params?.noWaterError ? 4 : -1, req.params?.freezeError ? 5 : -1]);
  }
);

P5005Register.register(
  49,
  "calibrate",
  (reader, bsdp) => {
    bsdp.appandData("success", reader.readBoolean());
    bsdp.appandData("heat", reader.readInt16() / 100);
    bsdp.appandData("normal", reader.readInt16() / 100);
    bsdp.appandData("calibration", reader.readInt16() / 100);
  },
  (req, writer) => {}
);

module.exports = { P5005Register };
