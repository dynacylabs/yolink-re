// Original webpack module: 69987 (OutletRegister)
//
// Near-identical twin of switch-register.js (module 11039) - same
// opcode table, same helper functions, same CommandRegister pattern.
//
// FINDING: not quite byte-for-byte identical, contrary to the earlier
// catalog-only pass's "identical command table" note. `getState` here
// is missing the pulseMode/led/battery decode branch that
// switch-register.js's getState (and this file's own `Report`) both
// have - so a getState call on an outlet never reports LED status,
// pulse-mode config, or battery level, while a Report event does. Kept
// faithful to this real, if likely unintentional, discrepancy.

const { CommandRegister } = require("../lora-packet-codec");

function readState(reader, bsdp) {
  bsdp.appandData("state", reader.readUInt8() == 1 ? "open" : "closed");
}

function readDelay(reader, bsdp) {
  bsdp.appandData("delay", { ch: reader.readUInt8(), on: reader.readUInt16(), off: reader.readUInt16() });
}

function readClockTime(reader, bsdp) {
  let year = reader.readUInt8();
  const month = reader.readUInt8() + 1;
  const day = reader.readUInt8();
  const hour = reader.readUInt8();
  const minute = reader.readUInt8();
  const second = reader.readUInt8();
  if (year && year >= 68) year -= 48;
  bsdp.appandData("time", new Date(`20${year}/${month}/${day} ${hour}:${minute}:${second}`));
}

function readVersion(reader, bsdp) {
  bsdp.appandData("version", reader.readHexString(2));
}

function readTimeZone(reader, bsdp) {
  bsdp.appandData("tz", reader.readInt8());
}

function readSchedules(reader, bsdp) {
  let supportSeconds = false;
  for (let slot = 0; slot < 6; slot++) {
    const flags = reader.readUInt8();
    supportSeconds = (flags & 240) > 0;
    const entry = {
      isValid: (flags & 15) > 0,
      week: reader.readUInt8(),
      index: reader.readUInt8(),
      on: reader.readUInt8() + ":" + reader.readUInt8() + (supportSeconds ? ":" + reader.readUInt8() : ""),
      off: reader.readUInt8() + ":" + reader.readUInt8() + (supportSeconds ? ":" + reader.readUInt8() : ""),
    };
    entry.index = slot;
    if (entry.week) bsdp.appandData(slot.toString(), entry);
  }
  bsdp.appandData("supportSeconds", supportSeconds);
}

// Same AppEUI-based pulse-relay-variant check as switch-register.js.
function isPulseModeVariant(packet) {
  return packet.appInfo.appEUI.substring(6, 10).toLowerCase() == "5706";
}

const OutletRegister = new CommandRegister("outlet");

OutletRegister.register(
  23,
  "getState",
  (reader, bsdp) => {
    readState(reader, bsdp);
    readDelay(reader, bsdp);
    bsdp.appandData("power", reader.readUint32());
    bsdp.appandData("watt", reader.readUint32());
    readVersion(reader, bsdp);
    readClockTime(reader, bsdp);
    readTimeZone(reader, bsdp);
    // [sic] no pulseMode/led/battery branch here, unlike Report below
    // and unlike switch-register.js's getState.
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {}
);

OutletRegister.register(
  26,
  "setState",
  (reader, bsdp) => {
    readState(reader, bsdp);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {
    writer.writeUInt8(1);
    writer.writeUInt8(req.params && req.params.state && req.params.state == "open" ? 1 : 0);
  }
);

OutletRegister.register(
  11,
  "setInitState",
  (reader, bsdp) => {
    bsdp.appandData("initState", { 85: "open", 136: "close", 170: "lastState" }[reader.readUInt8()] ?? "unknown");
  },
  (req, writer) => {
    writer.writeUInt8({ open: 85, close: 136, lastState: 170, get: 0 }[req.params.initState]);
  }
);

OutletRegister.register(
  29,
  "setDelay",
  (reader, bsdp) => {
    readState(reader, bsdp);
    const channel = reader.readUInt8();
    const flags = reader.readUInt8();
    if ((flags & 1) > 0) bsdp.appandData("delayOn", reader.readUInt16());
    else reader.skip(2);
    if ((flags & 2) > 0) bsdp.appandData("delayOff", reader.readUInt16());
    else reader.skip(2);
    bsdp.appandData("ch", channel);
  },
  (req, writer) => {
    writer.writeUInt8(1);
    let flags = 0;
    const bytes = [];
    if (req.params.delayOn != null) {
      flags |= 1;
      bytes.push(req.params.delayOn >> 8, req.params.delayOn % 256);
    } else {
      bytes.push(0, 0);
    }
    if (req.params.delayOff != null) {
      flags |= 2;
      bytes.push(req.params.delayOff >> 8, req.params.delayOff % 256);
    } else {
      bytes.push(0, 0);
    }
    writer.writeUInt8(flags);
    writer.writeBuffer(Buffer.from(bytes));
  }
);

OutletRegister.register(
  34,
  "getSchedules",
  (reader, bsdp) => readSchedules(reader, bsdp),
  (req, writer) => {}
);

OutletRegister.register(
  35,
  "setSchedules",
  (reader, bsdp) => readSchedules(reader, bsdp),
  (req, writer) => {
    writer.writeInt8(0);
    const supportSeconds = req.params.supportSeconds == 1;
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
        if (supportSeconds) writer.writeUInt8(parseInt(entry.on.split(":")[2]));
        writer.writeUInt8(parseInt(entry.off.split(":")[0]));
        writer.writeUInt8(parseInt(entry.off.split(":")[1]));
        if (supportSeconds) writer.writeUInt8(parseInt(entry.off.split(":")[2]));
      } else {
        writer.writeNone(supportSeconds ? 9 : 7);
      }
    }
  }
);

OutletRegister.register(
  39,
  "setDeviceAttributes",
  (reader, bsdp) => {
    if (isPulseModeVariant(reader.getPacket())) {
      if (reader.getRemainingSize() >= 2) {
        bsdp.appandData("pulseMode", { enable: reader.readUInt8() == 1, duration: 100 * reader.readUInt8() });
      }
    } else if (reader.getRemainingSize() >= 1) {
      bsdp.appandData("led", { status: reader.readUInt8() == 0 ? "on" : "off" });
    }
  },
  (req, writer) => {
    if (req.params.led?.status != null) {
      writer.writeUInt8(req.params.led?.status == "on" ? 0 : 1);
    } else if (req.params.pulseMode?.enable != null) {
      writer.writeUInt8(req.params.pulseMode.enable ? 1 : 0);
    }
    if (req.params.pulseMode?.duration != null) writer.writeUInt8(req.params.pulseMode.duration / 100);
  }
);

OutletRegister.register(
  48,
  "DevEvent",
  (reader, bsdp) => {
    const keyMask = reader.readUInt8();
    let type = 1;
    if (reader.getRemainingSize() >= 1) type = reader.readUInt8();
    bsdp.appandData("event", { keyMask, type: ["LongPress", "Press"][type] });
  },
  (req, writer) => {}
);

OutletRegister.register(
  129,
  "StatusChange",
  (reader, bsdp) => {
    readState(reader, bsdp);
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {}
);

OutletRegister.register(
  130,
  "powerReport",
  (reader, bsdp) => {
    const now = new Date();
    const watts = [];
    watts.push({ time: now.getTime(), watt: reader.readUint32() });
    watts.push({ time: now.getTime() - 3600000, watt: reader.readUint32() });
    watts.push({ time: now.getTime() - 7200000, watt: reader.readUint32() });
    watts.push({ time: now.getTime() - 10800000, watt: reader.readUint32() });
    bsdp.appandData("watts", watts);
    if (reader.getRemainingSize() >= 24) {
      const wattPerHours = [];
      for (let i = 0; i < 12; i++) {
        wattPerHours.push({ time: now.getTime() + 5 * (i - 12) * 60 * 1000, watt: reader.readUInt16() });
      }
      bsdp.appandData("wattPerHours", wattPerHours);
    }
  },
  (req, writer) => {}
);

OutletRegister.register(
  131,
  "Report",
  (reader, bsdp) => {
    readState(reader, bsdp);
    readDelay(reader, bsdp);
    bsdp.appandData("power", reader.readUint32());
    bsdp.appandData("watt", reader.readUint32());
    readVersion(reader, bsdp);
    readClockTime(reader, bsdp);
    readTimeZone(reader, bsdp);
    if (isPulseModeVariant(reader.getPacket())) {
      if (reader.getRemainingSize() >= 2) {
        bsdp.appandData("pulseMode", { enable: reader.readUInt8() == 1, duration: 100 * reader.readUInt8() });
      }
    } else {
      if (reader.getRemainingSize() >= 1) bsdp.appandData("led", { status: reader.readUInt8() == 0 ? "on" : "off" });
      if (reader.getRemainingSize() >= 1) bsdp.appandData("battery", reader.readUInt8());
    }
    bsdp.appendLoraInfo(reader.getLoraInfo());
  },
  (req, writer) => {}
);

module.exports = { OutletRegister };
