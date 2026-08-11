// Original webpack module: 52429 (P7616Register) - the most complex
// device handler in the bundle: a smart lock with fingerprint/card/
// password/fob credential management, temporary (one-time/range/
// periodic) access codes, and a large alert-type taxonomy. Registered
// under product keys "7616"/"7617"/"7618" (see
// p7616-lock-family-registration.js). Internal type string is "MFLock" -
// same as the HTTP-API layer's LockV2 handler (lock-v2-api-handler.js),
// strongly suggesting they're the same physical product line.
const { CommandRegister } = require("../lora-packet-codec");

const P7616Register = new CommandRegister("MFLock");

// Sub-command names multiplexed under opcode 48 ("userManagement").
const USER_MANAGEMENT_COMMANDS = [
  "none", "getUserList", "getUserCredentials", "addUserCredential", "delUserCredential",
  "delUser", "addTemporaryCredential", "delTemporaryCredential", "getTemporaryCredentials",
];
const TEMP_CREDENTIAL_TYPES = ["OneTime", "RangeTime", "PeriodTime"];
const LOCK_STATES = ["locked", "unlocked"];
const SCHEDULE_TYPES = ["disable", "daily", "weekly", "monthly"];

// Default "always valid" time range: 2000-01-01 to 2030-12-31 (Unix ms).
const DEFAULT_TIME_RANGE = { startAt: 946656000000, endAt: 1924963199000 };

const userManagementHandlers = new Map();

function readLockState(bsdp, reader) {
  bsdp.appandData("state", { lock: reader.readListByIndex(LOCK_STATES) });
}

// A large, sparse alert-type taxonomy - unlock/lock source
// (fingerprint/password/card/fob/mechanism/network/etc), plus a handful
// of device-health alerts (battery, temperature, door bell). Case 17
// (Fob) is context-sensitive: it means "Lock" if the just-decoded lock
// state (via bsdp.getData()) is "locked", "Unlock" otherwise.
function readAlertType(bsdp, reader) {
  switch (reader.readUInt8()) {
    case 0: bsdp.appandData("alert", { type: "UnLockFailed", source: "Fingerprint" }); break;
    case 1: bsdp.appandData("alert", { type: "UnLockFailed", source: "Password" }); break;
    case 2: bsdp.appandData("alert", { type: "UnLockFailed", source: "Card" }); break;
    case 5: bsdp.appandData("alert", { type: "HighTemperature" }); break;
    case 6: bsdp.appandData("alert", { type: "OpenRemind" }); break;
    case 7: bsdp.appandData("alert", { type: "LockFailed" }); break;
    case 10:
    case 11:
      bsdp.appandData("alert", { type: "LowBattery" });
      break;
    case 12: bsdp.appandData("alert", { type: "Unlock", source: "Fingerprint" }); break;
    case 13: bsdp.appandData("alert", { type: "Unlock", source: "Password" }); break;
    case 15: bsdp.appandData("alert", { type: "Unlock", source: "Card" }); break;
    case 17:
      bsdp.appandData("alert", { type: bsdp.getData()?.state?.lock == "locked" ? "Lock" : "Unlock", source: "Fob" });
      break;
    case 18: bsdp.appandData("alert", { type: "Unlock", source: "Mechanism" }); break;
    case 24: bsdp.appandData("alert", { type: "DoorBell" }); break;
    case 55: bsdp.appandData("alert", { type: "Unlock", source: "TemporaryPassword" }); break;
    case 62: bsdp.appandData("alert", { type: "Unlock", source: "network" }); break;
    case 70: bsdp.appandData("alert", { type: "Lock", source: "Automatic" }); break;
    case 71: bsdp.appandData("alert", { type: "Lock", source: "Manual" }); break;
    case 220: bsdp.appandData("alert", { type: "Unlock", source: "LocalPassword" });
  }
}

// Decodes a recurring-schedule descriptor: a type (disable/daily/
// weekly/monthly) plus a bitmask of applicable days (weekly, 7 bits,
// 0-indexed) or days-of-month (monthly, 31 bits, 1-indexed).
function readSchedule(reader) {
  let days = [];
  let type = reader.readListByIndex(SCHEDULE_TYPES);
  let mask = reader.readUint32();
  let bitCount = 0;
  let dayBase = 0;
  if (type == "weekly") bitCount = 7;
  else if (type == "monthly") {
    bitCount = 31;
    dayBase = 1;
  }
  for (var bit = 0; bit < bitCount; bit++) {
    if ((mask & (1 << bit)) > 0) days.push(dayBase + bit);
  }
  return { type, value: days };
}

// A credential "cipher" - the type (Card/Fingerprint/Fob/Password) plus
// an opaque secret. Password secrets are partially masked before being
// base64-encoded for transport in the decoded JSON (first+last
// character only, matching the same masking style as lock.js's PIN
// readback).
function readCipher(reader) {
  var type, secret;
  var raw = reader.readBuffer(8);
  if (raw[0] == 2) {
    type = "Card";
  } else if (raw[0] == 3) {
    type = "Fingerprint";
  } else if (raw[0] == 216) {
    type = "Fob";
    secret = raw.toString("base64");
  } else {
    type = "Password";
    let pwd = raw.toString();
    secret = pwd
      ? Buffer.from(
          (function maskPassword(p) {
            if (p) {
              if (p.length <= 1) return "*";
              if (p.length <= 3) return p[0] + "****************".substring(0, p.length - 1);
              return p[0] + "****************".substring(0, p.length - 2) + p[p.length - 1];
            }
          })(pwd)
        ).toString("base64")
      : undefined;
  }
  return { type, secret };
}

// Writes just the 1-byte credential-type marker (not the secret itself
// - see writeCipherSecret below). Note the Fob marker byte (238) here
// does NOT match the Fob detection byte (216) readCipher checks for on
// decode - kept faithful, possibly a real asymmetry between what the
// hub sends vs. what it expects to receive.
function writeCipherType(cipher, writer) {
  switch (cipher?.type) {
    case "Password": writer.writeUInt8(1); break;
    case "Card": writer.writeUInt8(2); break;
    case "Fingerprint": writer.writeUInt8(3); break;
    case "Fob": writer.writeUInt8(238); break;
    default: writer.writeNone();
  }
}

function writeCipherSecret(cipher, writer) {
  if (cipher?.type == "Fob" || cipher?.type == "Password") {
    writer.writeBuffer(Buffer.from(cipher.secret, "base64"), 8);
  } else if (cipher?.type == "Card") {
    writer.writeBuffer(Buffer.from([2]), 8);
  } else if (cipher?.type == "Fingerprint") {
    writer.writeBuffer(Buffer.from([3]), 8);
  } else {
    writer.writeNone(8);
  }
}

function writeSchedule(schedule, writer) {
  let typeIndex = 0;
  let mask = 0;
  if (schedule?.type != null) {
    typeIndex = SCHEDULE_TYPES.indexOf(schedule.type);
    if (typeIndex < 0) throw new Error("Unsupported type");
    let dayBase = schedule.type == "monthly" ? 1 : 0;
    if (schedule?.value?.length) {
      for (var i = 0; i < schedule.value.length; i++) mask += 1 << (schedule.value[i] - dayBase);
    }
  }
  writer.writeUInt8(typeIndex);
  writer.writeUInt32(mask);
}

// Encodes a {startAt, endAt} range (ms) as two 32-bit Unix-second
// timestamps - falls back to DEFAULT_TIME_RANGE ("always valid") if
// endAt is missing.
function writeTimeRange(range, writer) {
  var startAt = range?.startAt ?? new Date().getTime();
  var endAt = range?.endAt;
  if (endAt == null) {
    startAt = DEFAULT_TIME_RANGE.startAt;
    endAt = DEFAULT_TIME_RANGE.endAt;
  }
  writer.writeUInt32(startAt / 1000);
  writer.writeUInt32(endAt / 1000);
}

// Shared full-state decoder for getState and Report.
function decodeFullState(reader, bsdp) {
  readLockState(bsdp, reader);
  bsdp.appandData("battery", reader.readUInt8());
  readAlertType(bsdp, reader);
  bsdp.appandData("attributes", { openRemind: reader.readUInt8(), rlSet: reader.readListByIndex(["left", "right"]) });
  bsdp.appandData("version", reader.readHexString(2));
  bsdp.appandData("tz", reader.readInt8());
  reader.skip();
  reader.skip(6);
  bsdp.appandData("attributes", { soundLevel: reader.readUInt8(), autoLock: reader.readUInt8() });
  bsdp.appandData("state", { door: reader.readListByIndex(["closed", "open"]) });
  bsdp.appandData("attributes", { enableSetButton: reader.readBoolean() == 0 });
  if (reader.getRemainingSize() >= 1) bsdp.appandData("loraP2PHash", reader.readUInt8());
}

P7616Register.register(
  23,
  "getState",
  (reader, bsdp) => {
    decodeFullState(reader, bsdp);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {}
);

P7616Register.register(
  26,
  "setState",
  (reader, bsdp) => {
    readLockState(bsdp, reader);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    if (req.params?.state?.lock) {
      writer.writeUInt8(req.params.state.lock == "locked" || req.params.state.lock == "lock" ? 0 : 1);
    }
  }
);

P7616Register.register(
  36,
  "setTimeZone",
  (reader, bsdp) => {
    bsdp.appandData("tz", reader.readInt8());
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    writer.writeInt8(req.params.tz);
  }
);

P7616Register.register(
  39,
  "setAttributes",
  (reader, bsdp) => {
    bsdp.appandData("attributes", {
      openRemind: reader.readUInt8(),
      rlSet: reader.readListByIndex(["left", "right"]),
      soundLevel: reader.readUInt8(),
      autoLock: reader.readUInt8(),
      enableSetButton: reader.readBoolean() == 0,
    });
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    writer.writeInt8(req.params?.openRemind);
    writer.writeIndex(["left", "right"], req.params?.rlSet);
    writer.writeUInt8(req.params?.soundLevel);
    writer.writeUInt8(req.params?.autoLock);
    writer.writeBoolean(req.params?.enableSetButton == null ? undefined : req.params.enableSetButton == 0);
  }
);

P7616Register.register(
  40,
  "Alert",
  (reader, bsdp) => {
    readLockState(bsdp, reader);
    bsdp.appandData("battery", reader.readUInt8());
    readAlertType(bsdp, reader);
    // Unlock events (or a Lock event specifically from a Fob) also
    // carry which credential/user performed the action.
    if (
      bsdp.getData()?.alert?.type == "Unlock" ||
      (bsdp.getData()?.alert?.type == "Lock" && bsdp.getData()?.alert?.source == "Fob")
    ) {
      bsdp.appandData("alert", { credentialId: reader.readUInt8(), userId: reader.readUInt16() });
    }
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

P7616Register.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readLockState(bsdp, reader);
    bsdp.appandData("battery", reader.readUInt8());
    readAlertType(bsdp, reader);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

P7616Register.register(
  131,
  "Report",
  (reader, bsdp) => {
    decodeFullState(reader, bsdp);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  undefined
);

// ---- opcode 48 "userManagement" sub-command table ----

userManagementHandlers.set("getUserList", {
  decoder: (reader, bsdp) => {
    var count = reader.readUInt8();
    var users = [];
    for (var i = 0; i < count && reader.getRemainingSize() > 0; i++) users.push({ id: reader.readUInt8() });
    bsdp.appandData("users", users);
  },
  encoder: (req, writer) => {},
});

userManagementHandlers.set("getUserCredentials", {
  decoder: (reader, bsdp) => {
    var credentialCount = reader.readUInt8();
    var credentials = [];
    if (credentialCount <= 0) {
      bsdp.appandData("credentials", credentials);
    } else {
      var userId = reader.readUInt16();
      var shared = {
        startAt: 1000 * reader.readUint32(),
        endAt: 1000 * reader.readUint32(),
        effectivePeriod: readSchedule(reader),
        effectiveStartTime: reader.readHM(),
        effectiveEndTime: reader.readHM(),
        effectiveTimes: reader.readUInt8(),
      };
      for (var i = 0; i < credentialCount && reader.getRemainingSize() > 0; i++) {
        credentials.push(Object.assign({ id: reader.readUInt8(), cipher: readCipher(reader) }, shared));
      }
      bsdp.appandData("credentials", credentials);
      bsdp.appandData("userId", userId);
    }
  },
  encoder: (req, writer) => {
    if (req.params.userId == null) throw new Error("params.userId should not be null");
    writer.writeUInt16(req.params.userId);
  },
});

userManagementHandlers.set("addUserCredential", {
  decoder: (reader, bsdp) => {},
  encoder: (req, writer) => {
    writeCipherType(req.params.cipher, writer);
    writer.writeUInt16(req.params.userId);
    writeTimeRange(DEFAULT_TIME_RANGE, writer);
    writeSchedule({ type: "disable", value: [] }, writer);
    writer.writeHM("0:0");
    writer.writeHM("0:0");
    writer.writeUInt8(0);
    writer.writeUInt8(255);
    writeCipherSecret(req.params.cipher, writer);
  },
});

userManagementHandlers.set("delUserCredential", {
  decoder: (reader, bsdp) => {},
  encoder: (req, writer) => {
    if (req.params.userId == null || req.params.credentialId == null || req.params.cipherType == null) {
      throw new Error("params.userId and params.credentialId should not be null");
    }
    writeCipherType({ type: req.params.cipherType }, writer);
    writer.writeUInt16(req.params.userId);
    writer.writeUInt8(req.params.credentialId);
  },
});

userManagementHandlers.set("delUser", {
  decoder: (reader, bsdp) => {},
  encoder: (req, writer) => {
    if (req.params.userId == null) throw new Error("params.userId should not be null");
    writer.writeUInt8(0);
    writer.writeUInt16(req.params.userId);
  },
});

userManagementHandlers.set("addTemporaryCredential", {
  decoder: (reader, bsdp) => {},
  encoder: (req, writer) => {
    writer.writeIndex(TEMP_CREDENTIAL_TYPES, req.params.type);
    switch (req.params.type) {
      case "OneTime":
        // A one-time code that's only valid for the next 24 hours,
        // computed from wall-clock time at encode time (not a
        // caller-supplied range).
        writeCipherType(req.params.cipher, writer);
        writer.writeUInt32(new Date().getTime() / 1000);
        writer.writeUInt32(new Date().getTime() / 1000 + 86400);
        writeCipherSecret(req.params.cipher, writer);
        break;
      case "RangeTime":
        writeCipherType(req.params.cipher, writer);
        writeTimeRange(req.params, writer);
        writeCipherSecret(req.params.cipher, writer);
        break;
      case "PeriodTime":
        writeCipherType(req.params.cipher, writer);
        writeTimeRange(req.params, writer);
        writeSchedule(req.params.effectivePeriod, writer);
        writer.writeHM(req.params.effectiveStartTime);
        writer.writeHM(req.params.effectiveEndTime);
        writer.writeUInt8(req.params.effectiveTimes);
        writer.writeUInt8(255);
        writeCipherSecret(req.params.cipher, writer);
    }
  },
});

userManagementHandlers.set("delTemporaryCredential", {
  decoder: (reader, bsdp) => {},
  encoder: (req, writer) => {
    if (req.params.type == null || req.params.credentialId == null) {
      throw new Error("params.userId and params.credentialId should not be null");
    }
    writer.writeIndex(TEMP_CREDENTIAL_TYPES, req.params.type);
    writer.writeUInt8(req.params.credentialId);
  },
});

userManagementHandlers.set("getTemporaryCredentials", {
  decoder: (reader, bsdp) => {
    switch (reader.readListByIndex(TEMP_CREDENTIAL_TYPES)) {
      case "OneTime": {
        let count = reader.readUInt8();
        let credentials = [];
        for (var i = 0; i < count && reader.getRemainingSize() > 5; i++) {
          credentials.push({ id: reader.readUInt8(), cipher: readCipher(reader) });
        }
        bsdp.appandData("credentials", credentials);
        break;
      }
      case "RangeTime": {
        let count = reader.readUInt8();
        let credentials = [];
        for (var i = 0; i < count && reader.getRemainingSize() > 5; i++) {
          credentials.push({
            id: reader.readUInt8(),
            cipher: readCipher(reader),
            startAt: 1000 * reader.readUint32(),
            endAt: 1000 * reader.readUint32(),
          });
        }
        bsdp.appandData("credentials", credentials);
        break;
      }
      case "PeriodTime": {
        let count = reader.readUInt8();
        let credentials = [];
        for (var i = 0; i < count && reader.getRemainingSize() > 5; i++) {
          credentials.push({
            startAt: 1000 * reader.readUint32(),
            endAt: 1000 * reader.readUint32(),
            effectivePeriod: readSchedule(reader),
            effectiveStartTime: reader.readHM(),
            effectiveEndTime: reader.readHM(),
            effectiveTimes: reader.readUInt8(),
            id: reader.readUInt8(),
            cipher: readCipher(reader),
          });
        }
        bsdp.appandData("credentials", credentials);
      }
    }
  },
  encoder: (req, writer) => {
    if (req.params.type == null) throw new Error("params.userId should not be null");
    writer.writeIndex(TEMP_CREDENTIAL_TYPES, req.params.type);
  },
});

P7616Register.register(
  48,
  "userManagement",
  (reader, bsdp) => {
    var command = reader.readListByIndex(USER_MANAGEMENT_COMMANDS);
    bsdp.appandData("command", command);
    if (command && command != "none") userManagementHandlers.get(command).decoder(reader, bsdp);
  },
  (req, writer) => {
    var command = req.params.command;
    if (userManagementHandlers.has(command)) {
      writer.writeIndex(USER_MANAGEMENT_COMMANDS, command);
      userManagementHandlers.get(command).encoder(req, writer);
    }
  }
);

P7616Register.register(
  49,
  "userManagementEvent",
  (reader, bsdp) => {
    bsdp.appandData("command", "credentialProgressing");
    bsdp.appandData("state", { 0: "started", 252: "progressing", 253: "failed", 255: "done" }[reader.readUInt8()]);
    bsdp.appandData("step", reader.readUInt8());
    bsdp.appandData("credentialId", reader.readUInt8());
  },
  (req, writer) => {}
);

module.exports = { P7616Register };
