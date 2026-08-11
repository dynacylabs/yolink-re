// Original webpack module: 18838 (P5029Register) - the water-meter/
// dual-valve controller family's CommandRegister, registered under
// product key "5029" (see command-register-device-types.js). Uses
// water-meter-constants.js's P5029DeviceType as its internal type
// string, and reader/writer methods (readBitFlags, readInt16,
// readBoolean, readUInt24) not exercised by switch-register.js/
// outlet-register.js.
const { CommandRegister } = require("../lora-packet-codec");
const { P5029DeviceType } = require("../water-meter-constants");

const P5029Register = new CommandRegister(P5029DeviceType);

// Builds an object keyed 0,1,2,... from an array of values - used
// throughout to represent "per-valve" (2 elements) or "per-something"
// pairs as a dictionary rather than a plain array.
function toIndexedObject(values) {
  let obj = {};
  values.forEach((value, index) => {
    obj[index] = value;
  });
  return obj;
}

function pairOf(...values) {
  return toIndexedObject(values);
}

// Applies `mapFn` to each of `...values` and returns the results as an
// indexed object (see pairOf/toIndexedObject above).
function mapToIndexedObject(mapFn, ...values) {
  return toIndexedObject(values.map((v) => mapFn(v)));
}

// Reads `count` values off `source` (or undefined-fills if source is
// null), for building fixed-size per-valve/per-meter arrays.
function takeOrUndefined(source, count) {
  var result = [];
  for (let i = 0; i < count; i++) result.push(source == null ? undefined : source[i]);
  return result;
}

function mapEach(source, count, mapFn) {
  return takeOrUndefined(source, count).map((v) => mapFn(v));
}

function valveStateLabel(isOpen) {
  return isOpen ? "open" : "close";
}

function readMeterUnitAttributes(bsdp, reader) {
  let byte = reader.readUInt8();
  bsdp.appandData("attributes", { screenMeterUnit: 15 & byte, meterUnit: byte >> 4 });
}

// The meter step factor is stored as a signed 16-bit value: negative
// means "1/abs(value)", non-negative is used as-is.
function readMeterStepFactor(reader) {
  let raw = reader.readInt16();
  return raw < 0 ? -1 / raw : raw;
}

// Auto-close-valve settings, packed as 7 bit flags across two
// consecutive readBitFlags() calls (bits 1/4, 2/5, 3/6 pair up into
// per-valve overrun thresholds).
function readAutoCloseValveSettings(reader) {
  let flags = reader.readBitFlags();
  return {
    leakDetection: flags[0],
    overrunTimes24H: pairOf(flags[1], flags[4]),
    overrunAmount24H: pairOf(flags[2], flags[5]),
    overrunDurationOnce: pairOf(flags[3], flags[6]),
  };
}

// The core valve state + alarm block shared by StatusChange/Report/
// getState - 16 bit flags total, spread across two readBitFlags() calls.
function readValveStateAndAlarm(bsdp, reader) {
  let flags = [...reader.readBitFlags(), ...reader.readBitFlags()];
  bsdp.appandData("state", { valves: mapToIndexedObject(valveStateLabel, flags[0], flags[1]) });
  bsdp.appandData("alarm", {
    durationOverrun: pairOf(flags[2], flags[5]),
    timesOverrun24H: pairOf(flags[3], flags[6]),
    amountOverrun24H: pairOf(flags[4], flags[7]),
    leak: flags[8],
    valveError: pairOf(flags[9], flags[10]),
    reminder: flags[15],
  });
}

function readBattery(bsdp, reader) {
  let byte = reader.readUInt8();
  bsdp.appandData("battery", 15 & byte);
}

// Shared decoder for Report and getState - the full state/attributes/
// usage-history payload.
function decodeFullState(reader, bsdp) {
  readValveStateAndAlarm(bsdp, reader);
  readBattery(bsdp, reader);
  bsdp.appandData("version", reader.readHexString(2));
  bsdp.appandData("tz", reader.readInt8());
  reader.skip(2);
  bsdp.appandData("attributes", {
    alertInterval: reader.readUInt8(),
    beep: reader.readBoolean(),
    autoCloseValve: readAutoCloseValveSettings(reader),
  });
  readMeterUnitAttributes(bsdp, reader);
  bsdp.appandData("attributes", { meterStepFactor: readMeterStepFactor(reader) });
  bsdp.appandData("state", { meters: mapEach(reader, 2, () => reader.readUint32()) });
  bsdp.appandData("attributes", {
    overrunDuration: mapEach(reader, 2, () => reader.readUInt16()),
    overrunTimes24H: mapEach(reader, 2, () => reader.readUInt8()),
    overrunAmount24H: mapEach(reader, 2, () => reader.readUInt24()),
  });
  bsdp.appandData("recentUsage", {
    amount: mapEach(reader, 2, () => reader.readUInt16()),
    duration: mapEach(reader, 2, () => reader.readUInt8()),
  });
  bsdp.appandData("dailyUsage", mapEach(reader, 2, () => reader.readUInt16()));
  let flowFlags = reader.readBitFlags();
  bsdp.appandData("state", { waterFlowing: pairOf(flowFlags[0], flowFlags[1]) });
  bsdp.appendLoraInfo(reader.getLoraInfo());
}

P5029Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readValveStateAndAlarm(bsdp, reader);
    readBattery(bsdp, reader);
    bsdp.appandData("attributes", { alertInterval: reader.readUInt8() });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

P5029Register.register(131, "Report", (reader, bsdp) => decodeFullState(reader, bsdp), undefined);

P5029Register.register(23, "getState", (reader, bsdp) => decodeFullState(reader, bsdp), undefined);

P5029Register.register(
  26,
  "setState",
  (reader, bsdp) => {},
  (req, writer) => {
    // [sic] `e.params.valve` (singular) is read here instead of the
    // per-index `e.params.valves[t]` used in the loop condition - this
    // means the "open" branch of the mask (`o`) is computed from a
    // single top-level `valve` field regardless of which per-valve index
    // is being packed, while the "which valves are addressed" mask (`r`)
    // does iterate params.valves correctly. Also `r &=`/`o &=` (AND-
    // assign) rather than `|=` (OR-assign) means these masks can only
    // ever end up 0, never actually set any bit - likely a real
    // encoding bug, kept faithful.
    if (req.params.valves) {
      let addressMask = 0;
      let openMask = 1;
      for (let i = 0; i < 2; i++) {
        if (req.params.valves[i] != null) {
          addressMask &= 1 << i;
          openMask &= (req.params.valve == "open" ? 1 : 0) << i;
        }
      }
      writer.writeUInt8(addressMask);
      writer.writeUInt8(openMask);
    }
  }
);

P5029Register.register(
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
    else writer.writeUInt16(61166); // sentinel "no freeze protection"
  }
);

P5029Register.register(
  41,
  "setMeterAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", { meterStepFactor: readMeterStepFactor(reader), autoCloseValve: readAutoCloseValveSettings(reader) });
    readMeterUnitAttributes(bsdp, reader);
    bsdp.appandData("attributes", {
      meterInitValue: mapEach(reader, 2, () => reader.readUint32()),
      overrunDuration: mapEach(reader, 2, () => reader.readUInt16()),
      overrunTimes24H: mapEach(reader, 2, () => reader.readUInt8()),
      overrunAmount24H: mapEach(reader, 2, () => reader.readUInt24()),
    });
  },
  (req, writer) => {
    let stepFactor = req.params.meterStepFactor;
    if (stepFactor == null) writer.writeNone(2);
    else if (stepFactor < 0 || stepFactor >= 1) writer.writeInt16(stepFactor);
    else writer.writeInt16(-1 / stepFactor);

    (function writeAutoCloseValve(settings, w) {
      var byte = 255;
      if (settings != null) {
        byte = 0;
        if (settings.leakDetection) byte |= 1;
        var bits = [
          settings.leakDetection,
          ...takeOrUndefined(settings.overrunTimes24H, 2),
          ...takeOrUndefined(settings.overrunAmount24H, 2),
          ...takeOrUndefined(settings.overrunDurationOnce, 2),
        ];
        [bits[0], bits[1], bits[3], bits[5], bits[2], bits[4], bits[6]].forEach((bit, i) => {
          if (bit) byte |= 1 << i;
        });
      }
      w.writeUInt8(byte);
    })(req.params.autoCloseValve, writer);

    (function writeMeterUnits(w, request) {
      let byte = 255;
      if (request.params.screenMeterUnit != null) byte &= 240 | request.params.screenMeterUnit;
      if (request.params.meterUnit != null) byte &= 15 | (request.params.meterUnit << 4);
      w.writeUInt8(byte);
    })(writer, req);

    // Called unconditionally for both slots, even when undefined -
    // writeUInt32/16/8/24 already treat a null/undefined value as
    // "write padding" internally (see lora-packet-codec.js), so this
    // always emits a fixed-size field regardless of how many meters are
    // actually present.
    mapEach(req.params.meterInitValue, 2, (v) => writer.writeUInt32(v));
    mapEach(req.params.overrunDuration, 2, (v) => writer.writeUInt16(v));
    mapEach(req.params.overrunTimes24H, 2, (v) => writer.writeUInt8(v));
    mapEach(req.params.overrunAmount24H, 2, (v) => writer.writeUInt24(v));
  }
);

module.exports = { P5029Register };
