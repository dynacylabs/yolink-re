// Original webpack modules: 28552 (binary reader/writer + command
// registries), 16269 (P2P table command codec), 1964 (uplink/downlink
// packet classes)
//
// This is YoLink's own binary wire format for LoRa payloads - separate
// from (and layered underneath) ChirpStack, which only sees opaque
// PHYPayload bytes. ChirpStack handles the LoRaWAN MAC layer; everything
// in this file is YoLink's own application-layer framing on top of that.

// ---------------- Protocol namespace enum (original: n / t.Protocol) ----------------
const Protocol = { LoraCAN: 0, LoraWAN: 1 };

// ---------------- Binary reader (original: class i / YoLinkBufferReader) ----------------
class YoLinkBufferReader {
  #buffer;
  #index = 0;
  #packet;

  constructor(buffer, packet) {
    this.#buffer = buffer;
    this.#packet = packet;
  }

  readInt8() {
    const value = this.#buffer.readInt8(this.#index);
    this.#index++;
    return value;
  }
  readUInt8() {
    const value = this.#buffer[this.#index];
    this.#index++;
    return value;
  }
  readUInt16() {
    const value = this.#buffer.readUInt16BE(this.#index);
    this.#index += 2;
    return value;
  }
  readUInt24() {
    const value = this.#buffer.readUIntBE(this.#index, 3);
    this.#index += 3;
    return value;
  }
  readInt16() {
    const value = this.#buffer.readInt16BE(this.#index);
    this.#index += 2;
    return value;
  }
  readUint32() {
    const value = this.#buffer.readUInt32BE(this.#index);
    this.#index += 4;
    return value;
  }
  readBoolean() {
    return this.readUInt8() > 0;
  }
  readBooleanWithMask(mask) {
    return (this.readUInt8() & mask) > 0;
  }
  // Reads one byte, returns it as 8 individual booleans (bit 0 first).
  readBitFlags() {
    const byte = this.readUInt8();
    return [1, 2, 4, 8, 16, 32, 64, 128].map((bit) => (byte & bit) > 0);
  }
  // "Hour:Minute" - reads two bytes as a clock time string.
  readHM() {
    return `${this.readUInt8()}:${this.readUInt8()}`;
  }
  readBuffer(length) {
    const slice = this.#buffer.slice(this.#index, this.#index + length);
    this.#index += length;
    return slice;
  }
  readHexString(length) {
    return this.readBuffer(length).toString("hex");
  }
  readListByIndex(list) {
    return list[this.readUInt8()];
  }
  getBuffer() {
    return this.#buffer;
  }
  skip(n = 1) {
    this.#index += n;
    return this;
  }
  getRemainingSize() {
    const remaining = this.#buffer.length - this.#index;
    return remaining >= 0 ? remaining : 0;
  }
  getLoraInfo() {
    return this.#packet.loraInfo;
  }
  getPacket() {
    return this.#packet;
  }
}

// ---------------- Decoded-payload builder (original: class s / BSDPWriter) ----------------
// "BSDP" isn't spelled out anywhere in the bundle - probably something
// like "Binary [Sensor|Send] Data Packet". Accumulates a decoded LoRa
// payload into a plain {type, method, data, deviceId} object using
// dotted-path field names (e.g. "battery.level").
class BSDPWriter {
  #bsdp;

  constructor(type, method) {
    this.#bsdp = { type, method, data: {}, deviceId: undefined };
  }

  appendLoraInfo(loraInfo) {
    this.#bsdp.data.loraInfo = loraInfo;
  }

  getData() {
    return this.#bsdp.data;
  }

  // Writes `value` at dotted-path `key` within .data, creating
  // intermediate objects as needed. Arrays overwrite; plain objects merge
  // shallowly one level; everything else overwrites.
  appandData(key, value) {
    const parts = key.split(".");
    let target = this.#bsdp.data;
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        key = parts[i];
        if (target[key] == null) target[key] = {};
        target = target[key];
      }
      key = parts[parts.length - 1];
    }
    if (value instanceof Array) {
      target[key] = value;
    } else if (value instanceof Object) {
      if (target[key] == null) target[key] = {};
      target = target[key];
      for (const field in value) target[field] = value[field];
    } else {
      target[key] = value;
    }
  }

  build() {
    return this.#bsdp;
  }
}

// ---------------- Binary command writer (original: class a / RawCommandWritter) ----------------
// [sic] "Writter" - typo present in the original shipped code, kept here
// for fidelity/searchability against the real bundle.
class RawCommandWritter {
  #buffer;
  #size = 0;

  constructor(commandId, bufferCapacity = 128) {
    this.#buffer = Buffer.alloc(bufferCapacity);
    this.writeUInt16(commandId);
  }

  byteAt(i) {
    return this.#buffer[i];
  }
  byteOr(i, bits) {
    this.#buffer[i] |= bits;
    return this.byteAt(i);
  }
  writeInt8(v) {
    v == null ? this.writeNone() : (this.#buffer.writeInt8(v, this.#size), this.#size++);
  }
  writeUInt8(v) {
    v == null ? this.writeNone() : (this.#buffer.writeUInt8(v, this.#size), this.#size++);
  }
  writeBoolean(v) {
    this.writeUInt8(v == null ? undefined : v ? 1 : 0);
  }
  // Packs an array of bit-index numbers into one byte.
  writeBitFlags(bitIndices) {
    let byte = 0;
    bitIndices.forEach((bit) => {
      if (bit >= 0) byte |= 1 << bit;
    });
    this.writeUInt8(byte);
  }
  writeUInt16(v) {
    v == null ? this.writeNone(2) : (this.#buffer.writeUInt16BE(v, this.#size), (this.#size += 2));
  }
  writeUInt24(v) {
    v == null ? this.writeNone(3) : (this.#buffer.writeUIntBE(v, this.#size, 3), (this.#size += 3));
  }
  writeInt16(v) {
    v == null ? this.writeNone(2) : (this.#buffer.writeInt16BE(v, this.#size), (this.#size += 2));
  }
  writeUInt32(v) {
    v == null ? this.writeNone(4) : (this.#buffer.writeUInt32BE(v, this.#size), (this.#size += 4));
  }
  // "None"/unset is encoded as 0xFF byte(s), not zero - zero is a valid value.
  writeNone(byteCount = 1) {
    for (let i = 0; i < byteCount; i++) this.#buffer[this.#size + i] = 255;
    this.#size += byteCount;
  }
  // Writes the index of `value` within `enumList` (or "none" if absent).
  writeIndex(enumList, value) {
    let idx = -1;
    if (value != null) idx = enumList.indexOf(value);
    idx >= 0 && idx < enumList.length ? this.writeUInt8(idx) : this.writeNone();
  }
  writeHM(hourColonMinute) {
    hourColonMinute.split(":").forEach((part) => {
      if (part != null) this.writeUInt8(parseInt(part));
    });
  }
  writeBuffer(source, length) {
    length = length ?? source.length;
    source.copy(this.#buffer, this.#size, 0, length);
    this.#size += length;
  }
  build() {
    return this.#buffer.subarray(0, this.#size);
  }
}

// ---------------- Per-command decoder/encoder registries ----------------
// (original: class l / CommandDecoderRegister, class u / CommandEncoderRegister)
class CommandDecoderRegister {
  #decoders = new Map(); // commandId (uint16) -> (reader) => bsdp

  registerCommand(commandId, decode) {
    this.#decoders.set(commandId, decode);
  }

  decode(buffer, packet) {
    const reader = new YoLinkBufferReader(buffer, packet);
    const commandId = reader.readUInt16();
    if (this.#decoders.has(commandId)) return this.#decoders.get(commandId)(reader);
    throw new Error("Invalid data packet");
  }
}

class CommandEncoderRegister {
  #encoders = new Map(); // methodName -> (request) => Buffer

  registerCommand(methodName, encode) {
    this.#encoders.set(methodName, encode);
  }

  encode(request) {
    const methodParts = request.method.split(".");
    const leafMethod = methodParts[methodParts.length - 1];
    if (this.#encoders.has(leafMethod)) return this.#encoders.get(leafMethod)(request);
    return undefined;
  }
}

// One CommandRegister per device type (deviceType is the BSDP "type"
// string, e.g. "DoorSensor"). Each device-type handler module (not yet
// transcribed - see README) subclasses/uses this to register its own
// command set on top of these four commands, which are common to every
// device type.
class CommandRegister {
  deviceType;
  encoderRegister = new CommandEncoderRegister();
  decoderRegister = new CommandDecoderRegister();

  constructor(deviceType) {
    this.deviceType = deviceType;
    this.#registerCommonCommands();
  }

  #registerCommonCommands() {
    this.register(4, "factoryReset", () => {}, (_req, writer) => writer.writeUInt16(65535));
    this.register(5, "eraseUserData", () => {}, (_req, writer) => writer.writeUInt16(65535));
    this.register(253, "reboot", () => {}, () => {});
    this.register(
      225,
      "setLimitations",
      (reader, bsdp) => {
        bsdp.appandData("packetLimit", reader.readUInt16());
        bsdp.appandData("packetLimitDuration", reader.readUInt8());
      },
      (req, writer) => {
        writer.writeUInt16(req?.params?.packetLimit);
        writer.writeUInt8(req?.params?.packetLimitDuration);
      }
    );
    // "P2P tables" (see decodeP2PTableReport/encodeP2PTableSetting below) -
    // device-to-device pairing without the hub in the loop, e.g. a remote
    // directly triggering a siren.
    this.register(245, "setP2pTables", () => {}, (req, writer) => encodeP2PTableSettingWithWriter(req, writer));
    this.register(246, "reportP2PTable", (reader, bsdp) => {
      const report = decodeP2PTableReportWithReader(reader);
      bsdp.appandData("masterTable", report.masterTable);
      bsdp.appandData("slaverTable", report.slaverTable);
    });
  }

  register(commandId, method, decode, encode) {
    if (decode != null) {
      this.decoderRegister.registerCommand(commandId, (reader) => {
        const bsdp = new BSDPWriter(this.deviceType, method);
        decode(reader, bsdp);
        return bsdp.build();
      });
    }
    if (encode != null) {
      this.encoderRegister.registerCommand(method, (request) => {
        const writer = new RawCommandWritter(commandId);
        encode(request, writer);
        return writer.build();
      });
    }
  }

  apply(deviceIdOrKey, something, encoderTable, decoderTable) {
    encoderTable.registerDevice(deviceIdOrKey, something, this.deviceType, this.encoderRegister);
    decoderTable.registerDevice(deviceIdOrKey, something, this.deviceType, this.decoderRegister);
  }
}

// Keyed lookup of per-device-type registers, indexed two ways: by an exact
// "type-id" key, and by a secondary index (original code's `t` param -
// exact meaning of the secondary key wasn't pinned down in this pass).
class DeviceRegistryBase {
  #byKey = new Map();
  #byIndex = new Map();

  set(key, indexKey, register) {
    if (this.#byKey.has(key)) throw new Error("Codec " + key + " existed");
    let bucket = this.#byIndex.get(indexKey);
    if (bucket == null) {
      bucket = [];
      this.#byIndex.set(indexKey, bucket);
    }
    bucket.push(register);
    this.#byKey.set(key, register);
  }
  get(key) {
    return this.#byKey.get(key);
  }
  getByIndex(indexKey) {
    return this.#byIndex.get(indexKey);
  }
}

class DeviceDecoderRegister extends DeviceRegistryBase {
  registerDevice(a, deviceType, secondaryIndex, decoderRegister) {
    super.set(`${deviceType}-${a}`, secondaryIndex, decoderRegister);
  }
  getDecoder(a, deviceType) {
    return super.get(`${deviceType}-${a}`);
  }
}

class DeviceEncoderRegister extends DeviceRegistryBase {
  registerDevice(a, deviceType, secondaryIndex, encoderRegister) {
    super.set(`${deviceType}-${a}`, secondaryIndex, encoderRegister);
  }
  getEncoder(a, deviceType) {
    return super.get(`${deviceType}-${a}`);
  }
  getEncodersByDeviceType(deviceType) {
    return super.getByIndex(deviceType);
  }
}

// ---------------- P2P pairing table codec (original module 16269) ----------------
// Devices IDs in this table are reassembled as "d88b4c" + 5 raw bytes of
// hex - "d88b4c" is YoLink's fixed device-ID/OUI-style prefix, seen
// throughout this bundle (also in the AppEUI space-detection logic below).
function decodeP2PSingleTable(reader) {
  if (reader.getRemainingSize() < 3) return undefined;
  const total = reader.readInt8();
  const count = reader.readInt8();
  const table = { total, table: { count, startIndex: reader.readInt8(), list: [], crc: 0 } };
  if (count === 0) return table;
  if (reader.getRemainingSize() >= 7 * count) {
    for (let i = 0; i < count; i++) {
      const idBytes = reader.readBuffer(5);
      for (let b = 0; b < idBytes.length; b++) table.table.crc += idBytes[b];
      table.table.list.push({
        deviceId: "d88b4c" + idBytes.toString("hex"),
        channel: reader.readUInt8(),
        action: reader.readUInt8(),
      });
    }
    table.table.crc = 255 & table.table.crc;
  }
  return table;
}

const EMPTY_P2P_TABLE = { total: 0, table: { count: 0, startIndex: 0, list: [], crc: 0 } };

function decodeP2PTableReportWithReader(reader) {
  return {
    masterTable: decodeP2PSingleTable(reader) || EMPTY_P2P_TABLE,
    slaverTable: decodeP2PSingleTable(reader) || EMPTY_P2P_TABLE, // [sic] "slaver" - typo in original
  };
}

function decodeP2PTableReport(buffer, packet) {
  const reader = new YoLinkBufferReader(buffer, packet);
  reader.skip(2); // command id already consumed by the caller
  return decodeP2PTableReportWithReader(reader);
}

function encodeP2PTableSettingWithWriter(request, writer) {
  if (request.params?.action !== "pair" && request.params?.action !== "unpair") return;
  writer.writeUInt8(request.params.channel);
  writer.writeIndex(["pair", "unpair"], request.params.action);
  writer.writeUInt8(request.params.tables.length);
  request.params.tables.forEach((entry) => {
    writer.writeBuffer(Buffer.from(entry.deviceId.substring(6), "hex")); // strip the "d88b4c" prefix
    writer.writeUInt8(entry.class === "D" ? 3 : 2);
    writer.writeUInt8(entry.channel);
    writer.writeUInt8(entry.action);
  });
}

function encodeP2PTableSetting(request) {
  if (request.params?.action !== "pair" && request.params?.action !== "unpair") return;
  const writer = new RawCommandWritter(245);
  encodeP2PTableSettingWithWriter(request, writer);
  return writer.build();
}

// ---------------- Uplink/downlink packet wrapper classes (original module 1964) ----------------

class UpLinkDataPacket {
  rawData;
  constructor(rawData) {
    this.rawData = rawData;
  }
  getBSDP() {}
}

class DownlinkDataPacket {
  brdp; // sic - inconsistent with BSDP elsewhere; kept as found
  encoded;
  constructor(brdp) {
    this.brdp = brdp;
  }
  getEncoded() {
    return this.encoded;
  }
}

// True LoRaWAN-network uplink (arrives via ChirpStack). Figures out
// whether the sending device is in YoLink's own "LoraCAN" address space or
// a real "LoraWAN" one by checking the AppEUI: keys starting with
// "d88b4c" whose 7th-10th hex chars are >= "0000" are treated as LoraCAN.
class LoraUpLinkDataPacket extends UpLinkDataPacket {
  deviceId;
  space; // Protocol.LoraCAN | Protocol.LoraWAN
  loraInfo;
  loraPacketInfo;
  appInfo;
  #cachedBsdp;

  constructor(event) {
    super(event.data);
    this.deviceId = event.deviceId;

    const looksLikeLoraCAN = (e) =>
      e?.appInfo?.key != null && e.appInfo.key.indexOf("d88b4c") === 0 && e.appInfo.key.substring(6, 10) > "0000";

    this.space = looksLikeLoraCAN(event) ? Protocol.LoraCAN : Protocol.LoraWAN;
    this.appInfo = {
      appEUI: event.appInfo.key,
      devicePrefix: event.appInfo.key.substring(6, 8),
      deviceModel: event.appInfo.key.substring(6, 10),
    };
    this.loraInfo = {
      netId: event.loraNetId,
      devNetType: event.other.devNetType,
      signal: 0,
      gatewayId: "",
      gateways: 0,
      location: { latitude: 0, longitude: 0, altitude: 0 },
    };
    this.loraPacketInfo = event.other;

    // Aggregate signal/gateway-count/location across every gateway that
    // heard this uplink (ChirpStack's rxInfo array - a device can be heard
    // by more than one gateway at once).
    event.rxInfo?.forEach((rx) => {
      this.loraInfo.gateways += 1;
      if (this.loraInfo.signal === undefined || this.loraInfo.signal < rx.rssi) {
        this.loraInfo.signal = rx.rssi;
        this.loraInfo.gatewayId = rx.gatewayID;
      }
      if (this.loraInfo.location === undefined && rx.location) this.loraInfo.location = rx.location;
    });

    this.build();
  }

  build() {
    if (this.#cachedBsdp == null) {
      const decoder = CodecFactory.getDecoderByAppEUI(this.appInfo.appEUI);
      if (decoder != null) this.#cachedBsdp = decoder.decode(this.rawData, this);
    }
  }

  getBSDP() {
    return this.#cachedBsdp;
  }

  getDeviceState(bsdp) {
    if (bsdp && bsdp.data && bsdp.data.loraInfo) return bsdp.data;
  }
}

class LoraDownlinkDataPacket extends DownlinkDataPacket {
  type;
  appInfo;

  constructor(appEUI, request) {
    super(request);
    this.appInfo = {
      appEUI,
      devicePrefix: appEUI.substring(6, 8),
      deviceModel: appEUI.substring(6, 10),
    };
    this.type = request?.method ? request.method.split(".")[0] : deviceNsTypeFromAppEUI(appEUI) || "unknown";
    if (!request || !request.method) return;

    let encoder;
    if (this.appInfo.appEUI) encoder = CodecFactory.getEncoderByAppEUI(this.appInfo.appEUI);
    if (encoder == null) {
      const candidates = CodecFactory.getEncodersByType(this.type);
      if (candidates != null && candidates.length > 0) encoder = candidates[0];
    }
    if (encoder != null) this.encoded = encoder.encode(request, this);
  }
}

class HubUpLinkDataPacket extends UpLinkDataPacket {
  constructor(data) {
    super(data);
  }
}

class HubDownlinkDataPacket extends DownlinkDataPacket {
  constructor(data) {
    super(data);
  }
}

module.exports = {
  Protocol,
  YoLinkBufferReader,
  BSDPWriter,
  RawCommandWritter,
  CommandDecoderRegister,
  CommandEncoderRegister,
  CommandRegister,
  DeviceDecoderRegister,
  DeviceEncoderRegister,
  decodeP2PTableReport,
  decodeP2PTableReportWithReader,
  encodeP2PTableSetting,
  encodeP2PTableSettingWithWriter,
  UpLinkDataPacket,
  DownlinkDataPacket,
  LoraUpLinkDataPacket,
  LoraDownlinkDataPacket,
  HubUpLinkDataPacket,
  HubDownlinkDataPacket,
};
