// Original webpack module: 85430 - registers THREE separate
// CommandRegister instances in one module: P5006Register, P5007Register,
// and P5009Register (product keys "5006"/"5008"/"5018", "5007", and
// "5009" respectively - see command-register-device-types.js). All
// three share the "WaterMeterController" type string
// (water-meter-constants.js's DeviceType) and a set of common decode
// helpers, but each registers a genuinely different opcode set -
// P5006Register is the most complete (adds valve-maintenance
// scheduling), P5007Register is the leanest.
//
// This is also the only device handler in the whole bundle that writes
// back into local device-state storage as a side effect of decoding a
// command response (see the setAttributes/setMeterAttributes/
// setValveMaintance handlers on P5009Register/P5006Register below,
// which call device-state-store.js's saveState) - every other handler
// in this bundle is a pure decode/encode function with no side effects
// of its own.
const { saveState } = require("../device-state-store");
const { CommandRegister } = require("../lora-packet-codec");
const { DeviceType, ENUM_LEAK_TYPE } = require("../water-meter-constants");

const P5006Register = new CommandRegister(DeviceType);
const P5007Register = new CommandRegister(DeviceType);
const P5009Register = new CommandRegister(DeviceType);

// Valve+alarm state, P5006/P5007 variant (8 bit flags).
function readValveAlarmV1(bsdp, reader) {
  let flags = reader.readBitFlags();
  bsdp.appandData("state", { valve: flags[0] ? "open" : "close" });
  bsdp.appandData("alarm", {
    openReminder: flags[1],
    leak: flags[2],
    amountOverrun: flags[3],
    durationOverrun: flags[4],
    valveError: flags[5],
    reminder: flags[6],
    freezeError: flags[7],
  });
}

// Valve+alarm state, P5009 variant (different flag meanings at the same
// bit positions - not just a superset/subset of the V1 layout above).
function readValveAlarmV2(bsdp, reader) {
  let flags = reader.readBitFlags();
  bsdp.appandData("state", { valve: flags[0] ? "open" : "close" });
  bsdp.appandData("alarm", {
    leak: flags[1],
    overrunTimes24H: flags[2],
    overrunAmount24H: flags[3],
    overrunDurationOnce: flags[4],
    valveError: flags[5],
    reminder: flags[6],
  });
}

function readMeterUnitAttributes(bsdp, reader) {
  let byte = reader.readUInt8();
  bsdp.appandData("attributes", { screenMeterUnit: 15 & byte, meterUnit: byte >> 4 });
}

function writeMeterUnitAttributes(writer, req) {
  let byte = 255;
  if (req.params.screenMeterUnit != null) byte &= 240 | req.params.screenMeterUnit;
  if (req.params.meterUnit != null) byte &= 15 | (req.params.meterUnit << 4);
  writer.writeUInt8(byte);
}

function readBattery(bsdp, reader) {
  let byte = reader.readUInt8();
  bsdp.appandData("battery", 15 & byte);
  bsdp.appandData("powerSupply", (byte || 0) > 15 ? "PowerLine" : "battery");
}

function readValveDelay(reader, bsdp) {
  let entry = { ch: 1 };
  if (reader.readBoolean()) entry.on = reader.readUInt16();
  else entry.off = reader.readUInt16();
  bsdp.appandData("valveDelay", entry);
}

// The meter step factor is a signed 16-bit value: negative means
// "1/abs(value)" (same convention as p5029-register.js).
function readMeterStepFactor(reader) {
  let raw = reader.readInt16();
  return raw < 0 ? -1 / raw : raw;
}

function writeMeterStepFactor(value, writer) {
  if (value == null) writer.writeNone(2);
  else if (value < 0 || value >= 1) writer.writeInt16(value);
  else writer.writeInt16(-1 / value);
}

// Full state decoder for P5006Register's Report/getState.
function decodeP5006FullState(reader, bsdp) {
  readValveAlarmV1(bsdp, reader);
  readBattery(bsdp, reader);
  readValveDelay(reader, bsdp);
  bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
  bsdp.appandData("version", reader.readHexString(2));
  bsdp.appandData("tz", reader.readInt8());
  reader.skip(2);
  readMeterUnitAttributes(bsdp, reader);
  bsdp.appandData("attributes", { alertInterval: reader.readUInt8(), meterStepFactor: readMeterStepFactor(reader) });
  bsdp.appandData("state", { meter: reader.readUint32() });
  bsdp.appandData("attributes", { leakLimit: reader.readUInt16() });
  var acvFlags = reader.readBitFlags();
  bsdp.appandData("attributes", { autoCloseValve: acvFlags[0], overrunAmountACV: acvFlags[1], overrunDurationACV: acvFlags[2] });
  bsdp.appandData("attributes", {
    leakPlan: ENUM_LEAK_TYPE[reader.readUInt8()],
    overrunAmount: reader.readUInt16(),
    overrunDuration: reader.readUInt8(),
  });
  bsdp.appandData("recentUsage", { amount: reader.readUInt16(), duration: reader.readUInt8() });
  if (reader.getRemainingSize() >= 5) {
    reader.skip();
    bsdp.appandData("attributes", { freezeTemp: reader.readInt16() / 10 });
    bsdp.appandData("temperature", reader.readInt16() / 10);
  }
  if (reader.getRemainingSize() >= 2) bsdp.appandData("dailyUsage", reader.readUInt16());
  if (reader.getRemainingSize() >= 1) {
    var flowFlags = reader.readBitFlags();
    bsdp.appandData("state", { waterFlowing: flowFlags[0] });
  }
  bsdp.appendLoraInfo(reader.getLoraInfo());
}

// Full state decoder for P5007Register's Report/getState - a leaner
// variant with no autoCloseValve/dailyUsage/waterFlowing fields at all.
function decodeP5007FullState(reader, bsdp) {
  readValveAlarmV1(bsdp, reader);
  readBattery(bsdp, reader);
  bsdp.appandData("version", reader.readHexString(2));
  reader.skip(1);
  bsdp.appandData("attributes", { alertInterval: reader.readUInt8(), screenDuration: reader.readUInt8() });
  readMeterUnitAttributes(bsdp, reader);
  bsdp.appandData("attributes", { meterStepFactor: readMeterStepFactor(reader) });
  bsdp.appandData("state", { meter: reader.readUint32() });
  bsdp.appandData("attributes", {
    leakLimit: reader.readUInt16(),
    leakPlan: ENUM_LEAK_TYPE[reader.readUInt8()],
    overrunAmount: reader.readUInt16(),
    overrunDuration: reader.readUInt8(),
  });
  bsdp.appandData("recentUsage", { amount: reader.readUInt16(), duration: reader.readUInt8() });
  bsdp.appendLoraInfo(reader.getLoraInfo());
}

// Full state decoder for P5009Register's Report/getState - uses the V2
// valve/alarm layout, a richer autoCloseValve object (vs P5006's flat
// booleans), and adds valve-maintenance scheduling.
function decodeP5009FullState(reader, bsdp) {
  readValveAlarmV2(bsdp, reader);
  readBattery(bsdp, reader);
  bsdp.appandData("version", reader.readHexString(2));
  bsdp.appandData("tz", reader.readInt8());
  reader.skip(2);
  readMeterUnitAttributes(bsdp, reader);
  bsdp.appandData("attributes", { alertInterval: reader.readUInt8(), meterStepFactor: readMeterStepFactor(reader) });
  bsdp.appandData("state", { meter: reader.readUint32() });
  var acvFlags = reader.readBitFlags();
  bsdp.appandData("attributes", {
    autoCloseValve: {
      leakDetection: acvFlags[0],
      overrunTimes24H: acvFlags[1],
      overrunAmount24H: acvFlags[2],
      overrunDurationOnce: acvFlags[3],
    },
  });
  bsdp.appandData("attributes", {
    overrunDurationOnce: reader.readUInt16(),
    overrunTimes24H: reader.readUInt8(),
    overrunAmount24H: reader.readUInt24(),
    beep: reader.readBoolean(),
  });
  bsdp.appandData("recentUsage", { amount: reader.readUInt16(), duration: reader.readUInt8() });
  if (reader.getRemainingSize() >= 3) bsdp.appandData("dailyUsage", { amount: reader.readUInt16(), times: reader.readUInt16() });
  if (reader.getRemainingSize() >= 1) {
    var flowFlags = reader.readBitFlags();
    bsdp.appandData("state", { waterFlowing: flowFlags[0] });
  }
  if (reader.getRemainingSize() >= 4) {
    bsdp.appandData("valveMaintance", { // [sic] "Maintance"
      type: ["disable", "weekly", "monthly"][reader.readUInt8()],
      day: reader.readInt8(),
      time: reader.readUInt8() + ":" + reader.readUInt8(),
    });
  }
  bsdp.appendLoraInfo(reader.getLoraInfo());
}

// Shared valve/leak-schedule decoder (opcodes 34/35/37/38 across all
// three registers) - up to 6 slots, growing an extra 2-byte leakLimit
// field per slot for "leak" schedules IF there's enough remaining
// buffer to suggest this firmware reports it (>= 54 bytes total).
function readSchedules(reader, bsdp, kind) {
  let hasLeakVolume = kind == "leak" && reader.getRemainingSize() >= 54;
  for (let slot = 0; slot < 6; slot++) {
    let entry = {
      isValid: reader.readBooleanWithMask(15),
      week: reader.readUInt8(),
      index: reader.readUInt8(),
      on: reader.readUInt8() + ":" + reader.readUInt8(),
      off: reader.readUInt8() + ":" + reader.readUInt8(),
    };
    if (hasLeakVolume) entry.leakLimit = reader.readUInt16();
    entry.index = slot;
    if (entry.week) bsdp.appandData(slot.toString(), entry);
  }
  bsdp.appandData("supportLeakVolume", hasLeakVolume);
}

function writeSchedules(req, writer, kind) {
  writer.writeInt8(0);
  let hasLeakVolume =
    kind == "leak" &&
    (function anyScheduleHasLeakLimit(request) {
      for (var slot in request.params.sches) {
        if (request.params.sches[slot].leakLimit != null) return true;
      }
      return false;
    })(req);
  for (let slot = 0; slot < 6; slot++) {
    if (req.params.sches[slot]) {
      writer.byteOr(2, 1 << slot);
      if (req.params.sches[slot].isValid === undefined) req.params.sches[slot].isValid = true;
      writer.writeUInt8(req.params.sches[slot].isValid ? 1 : 0);
      writer.writeUInt8(req.params.sches[slot].week);
      writer.writeUInt8(1);
      writer.writeUInt8(parseInt(req.params.sches[slot].on.split(":")[0]));
      writer.writeUInt8(parseInt(req.params.sches[slot].on.split(":")[1]));
      writer.writeUInt8(parseInt(req.params.sches[slot].off.split(":")[0]));
      writer.writeUInt8(parseInt(req.params.sches[slot].off.split(":")[1]));
      if (hasLeakVolume) writer.writeUInt16(req.params.sches[slot].leakLimit);
    } else {
      writer.writeNone(hasLeakVolume ? 9 : 7);
    }
  }
}

// ============ P5006Register ============

P5006Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readValveAlarmV1(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5006Register.register(131, "Report", (reader, bsdp) => decodeP5006FullState(reader, bsdp), undefined);
P5006Register.register(
  40,
  "Alert",
  (reader, bsdp) => {
    readValveAlarmV1(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { openReminder: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5006Register.register(23, "getState", (reader, bsdp) => decodeP5006FullState(reader, bsdp), (req, writer) => {});
P5006Register.register(
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
P5006Register.register(
  29,
  "setDelay",
  (reader, bsdp) => readValveDelay(reader, bsdp),
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
P5006Register.register(34, "getValveSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "valve"), (req, writer) => {});
P5006Register.register(35, "setValveSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "valve"), (req, writer) => writeSchedules(req, writer, "valve"));
P5006Register.register(
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
P5006Register.register(37, "getLeakSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "leak"), (req, writer) => {});
P5006Register.register(38, "setLeakSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "leak"), (req, writer) => writeSchedules(req, writer, "leak"));
P5006Register.register(
  39,
  "setAttributes",
  (reader, bsdp) => {
    let openReminder = reader.readUInt8();
    reader.skip(2);
    let alertInterval = reader.readUInt8();
    bsdp.appandData("attributes", { openReminder, alertInterval });
  },
  (req, writer) => {
    writer.writeUInt8(req.params.openReminder);
    writer.writeNone();
    writer.writeNone();
    writer.writeUInt8(req.params.alertInterval);
    if (req.params.freezeTemp != null) writer.writeInt16(10 * req.params.freezeTemp);
    else writer.writeUInt16(61166);
  }
);
P5006Register.register(
  41,
  "setMeterAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", { meterStepFactor: readMeterStepFactor(reader), meterInitValue: reader.readUint32(), leakLimit: reader.readUInt16() });
    var acvFlags = reader.readBitFlags();
    bsdp.appandData("attributes", { autoCloseValve: acvFlags[0], overrunAmountACV: acvFlags[1], overrunDurationACV: acvFlags[2] });
    bsdp.appandData("attributes", { leakPlan: ENUM_LEAK_TYPE[reader.readUInt8()], overrunAmount: reader.readUInt16(), overrunDuration: reader.readUInt8() });
    readMeterUnitAttributes(bsdp, reader);
  },
  (req, writer) => {
    writeMeterStepFactor(req.params.meterStepFactor, writer);
    writer.writeUInt32(req.params.meterInitValue);
    writer.writeUInt16(req.params.leakLimit);
    var acvByte = 255;
    if (req.params.autoCloseValve != null) {
      acvByte = 0;
      if (req.params.autoCloseValve) acvByte |= 1;
      if (req.params.overrunAmountACV) acvByte |= 2;
      if (req.params.overrunDurationACV) acvByte |= 4;
    }
    writer.writeUInt8(acvByte);
    writer.writeIndex(ENUM_LEAK_TYPE, req.params.leakPlan);
    writer.writeUInt16(req.params.overrunAmount);
    writer.writeUInt8(req.params.overrunDuration);
    writeMeterUnitAttributes(writer, req);
  }
);
P5006Register.register(
  53,
  "getValveMaintance", // [sic]
  (reader, bsdp) => {
    bsdp.appandData("type", ["disable", "weekly", "monthly"][reader.readUInt8()]);
    bsdp.appandData("day", reader.readInt8());
    bsdp.appandData("time", reader.readUInt8() + ":" + reader.readUInt8());
  },
  (req, writer) => {}
);
P5006Register.register(
  54,
  "setValveMaintance", // [sic]
  (reader, bsdp) => {
    bsdp.appandData("type", ["disable", "weekly", "monthly"][reader.readUInt8()]);
    bsdp.appandData("day", reader.readInt8());
    bsdp.appandData("time", reader.readUInt8() + ":" + reader.readUInt8());
  },
  (req, writer) => {
    writer.writeIndex(["disable", "weekly", "monthly"], req.params.type);
    writer.writeInt8(req.params.day);
    writer.writeHM(req.params.time);
  }
);

// ============ P5009Register (uses the V2 valve/alarm layout and
// writes-back to local device state, unlike P5006/P5007) ============

P5009Register.register(23, "getState", (reader, bsdp) => decodeP5009FullState(reader, bsdp), (req, writer) => {});
P5009Register.register(
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
P5009Register.register(
  39,
  "setAttributes",
  (reader, bsdp) => {
    reader.skip(3);
    let alertInterval = reader.readUInt8();
    let beep = reader.readBoolean();
    bsdp.appandData("attributes", { alertInterval, beep });
  },
  (req, writer) => {
    writer.writeNone();
    writer.writeNone();
    writer.writeNone();
    writer.writeUInt8(req.params.alertInterval);
    writer.writeBoolean(req.params.beep);
    // Persists the just-set attributes into local device-state cache as
    // a side effect - not just an outbound-encode function, unlike
    // every other register() encoder in this bundle.
    let stateUpdate = { attributes: {} };
    if (req.params.alertInterval != null) stateUpdate.attributes.alertInterval = req.params.alertInterval;
    if (req.params.beep != null) stateUpdate.attributes.beep = req.params.beep;
    saveState(req.targetDevice, { deviceState: stateUpdate }, { extend: true, setOnly: true }).catch(() => {});
  }
);
P5009Register.register(
  40,
  "Alert",
  (reader, bsdp) => {
    readValveAlarmV2(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { alertInterval: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5009Register.register(
  41,
  "setMeterAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", { meterStepFactor: readMeterStepFactor(reader), meterInitValue: reader.readUint32() });
    var acvFlags = reader.readBitFlags();
    bsdp.appandData("attributes", {
      autoCloseValve: {
        leakDetection: acvFlags[0],
        overrunTimes24H: acvFlags[1],
        overrunAmount24H: acvFlags[2],
        overrunDurationOnce: acvFlags[3],
      },
    });
    bsdp.appandData("attributes", { overrunDurationOnce: reader.readUInt16(), overrunTimes24H: reader.readUInt8(), overrunAmount24H: reader.readUInt24() });
    readMeterUnitAttributes(bsdp, reader);
  },
  (req, writer) => {
    writeMeterStepFactor(req.params.meterStepFactor, writer);
    writer.writeUInt32(req.params.meterInitValue);
    let stateUpdate = { attributes: {} };
    var acvByte = 255;
    if (req.params.autoCloseValve != null) {
      acvByte = 0;
      stateUpdate.attributes.autoCloseValve = req.params.autoCloseValve;
      if (req.params.autoCloseValve.leakDetection) acvByte |= 1;
      if (req.params.autoCloseValve.overrunTimes24H) acvByte |= 2;
      if (req.params.autoCloseValve.overrunAmount24H) acvByte |= 4;
      if (req.params.autoCloseValve.overrunDurationOnce) acvByte |= 8;
    }
    writer.writeUInt8(acvByte);
    writer.writeUInt16(req.params.overrunDurationOnce);
    writer.writeUInt8(req.params.overrunTimes24H);
    writer.writeUInt24(req.params.overrunAmount24H);
    if (req.params.overrunDurationOnce != null) stateUpdate.attributes.overrunDurationOnce = req.params.overrunDurationOnce;
    if (req.params.overrunTimes24H != null) stateUpdate.attributes.overrunTimes24H = req.params.overrunTimes24H;
    if (req.params.overrunAmount24H != null) stateUpdate.attributes.overrunAmount24H = req.params.overrunAmount24H;
    saveState(req.targetDevice, { deviceState: stateUpdate }, { extend: true, setOnly: true }).catch(() => {});
    writeMeterUnitAttributes(writer, req);
  }
);
P5009Register.register(
  53,
  "getValveMaintance", // [sic]
  (reader, bsdp) => {
    bsdp.appandData("type", ["disable", "weekly", "monthly"][reader.readUInt8()]);
    bsdp.appandData("day", reader.readInt8());
    bsdp.appandData("time", reader.readUInt8() + ":" + reader.readUInt8());
  },
  (req, writer) => {}
);
P5009Register.register(
  54,
  "setValveMaintance", // [sic]
  (reader, bsdp) => {
    bsdp.appandData("type", ["disable", "weekly", "monthly"][reader.readUInt8()]);
    bsdp.appandData("day", reader.readInt8());
    bsdp.appandData("time", reader.readUInt8() + ":" + reader.readUInt8());
  },
  (req, writer) => {
    writer.writeIndex(["disable", "weekly", "monthly"], req.params.type);
    writer.writeInt8(req.params.day);
    writer.writeHM(req.params.time);
    saveState(
      req.targetDevice,
      { deviceState: { valveMaintance: { type: req.params.type, day: req.params.day, time: req.params.time } } }, // [sic] "valveMaintance"
      { extend: true, setOnly: true }
    ).catch(() => {});
  }
);
P5009Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readValveAlarmV2(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { alertInterval: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5009Register.register(131, "Report", (reader, bsdp) => decodeP5009FullState(reader, bsdp), undefined);
P5009Register.register(
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

// ============ P5007Register (the leanest of the three - no valve
// delay, no valve-maintenance, no local-state writeback) ============

P5007Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readValveAlarmV1(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5007Register.register(
  131,
  "Report",
  (reader, bsdp) => {
    decodeP5007FullState(reader, bsdp);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5007Register.register(
  40,
  "Alert",
  (reader, bsdp) => {
    readValveAlarmV1(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);
P5007Register.register(23, "getState", (reader, bsdp) => decodeP5007FullState(reader, bsdp), (req, writer) => {});
P5007Register.register(37, "getLeakSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "leak"), (req, writer) => {});
P5007Register.register(38, "setLeakSchedules", (reader, bsdp) => readSchedules(reader, bsdp, "leak"), (req, writer) => writeSchedules(req, writer, "leak"));
P5007Register.register(
  39,
  "setAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", { alertInterval: reader.readUInt8(), screenDuration: reader.readUInt8() });
  },
  (req, writer) => {
    writer.writeUInt8(req.params.alertInterval);
    writer.writeUInt8(req.params.screenDuration);
  }
);
P5007Register.register(
  41,
  "setMeterAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", {
      meterStepFactor: readMeterStepFactor(reader),
      meterInitValue: reader.readUint32(),
      leakLimit: reader.readUInt16(),
      leakPlan: ENUM_LEAK_TYPE[reader.skip().readUInt8()],
      overrunAmount: reader.readUInt16(),
      overrunDuration: reader.readUInt8(),
    });
    readMeterUnitAttributes(bsdp, reader);
  },
  (req, writer) => {
    writeMeterStepFactor(req.params.meterStepFactor, writer);
    writer.writeUInt32(req.params.meterInitValue);
    writer.writeUInt16(req.params.leakLimit);
    writer.writeNone();
    writer.writeIndex(ENUM_LEAK_TYPE, req.params.leakPlan);
    writer.writeUInt16(req.params.overrunAmount);
    writer.writeUInt8(req.params.overrunDuration);
    writeMeterUnitAttributes(writer, req);
  }
);

module.exports = { P5006Register, P5007Register, P5009Register };
