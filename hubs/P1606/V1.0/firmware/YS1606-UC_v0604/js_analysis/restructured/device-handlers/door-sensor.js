// Original webpack module: 46678 (DoorSensor)
//
// One of two parallel patterns used for device-type command codecs in
// this bundle (see also command-register-handlers.js for the other). This
// one subclasses DataPacket directly and hand-rolls its own opcode
// switch, rather than using CommandRegister.register() per command.
//
// Opcode table (byte 1 of the raw LoRa payload):
//   129 (0x81) StatusChange   131 (0x83) Report   40 (0x28) Alert
//   22  (0x16) getVersion     23  (0x17) getState  39 (0x27) setOpenRemind
// State byte values: 0=closed 1=open 2=error 3=open+alert("openRemind")

const { DataPacket } = require("./data-packet"); // original module 78940

class DoorSensor extends DataPacket {
  constructor(rawData) {
    super(rawData);
    this.devClassType = "ClassA";
  }

  // ---- individual field decoders, composed by the anasysXxx methods below ----
  #decodeState(bsdp, stateByte) {
    bsdp.data = bsdp.data || {};
    bsdp.data.state = ["closed", "open", "error", "open"][stateByte] || "error";
    bsdp.data.alertType = stateByte === 3 ? "openRemind" : "normal";
  }
  #decodeBattery(bsdp, batteryByte) {
    bsdp.data = bsdp.data || {};
    bsdp.data.battery = batteryByte || 0;
  }
  #decodeDelay(bsdp, delayByte) {
    bsdp.data = bsdp.data || {};
    bsdp.data.delay = delayByte || 0;
  }
  #decodeOpenRemindDelay(bsdp, value) {
    bsdp.data = bsdp.data || {};
    bsdp.data.openRemindDelay = value || 0;
  }
  #decodeAlertInterval(bsdp, value) {
    bsdp.data = bsdp.data || {};
    bsdp.data.alertInterval = value || 0;
  }
  #decodeVersion(bsdp, versionHex) {
    if (versionHex) {
      bsdp.data = bsdp.data || {};
      bsdp.data.version = versionHex || 0;
    }
  }
  #decodeLoraInfo(bsdp) {
    if (this.loraInfo) {
      bsdp.data = bsdp.data || {};
      bsdp.data.loraInfo = this.loraInfo;
    }
  }

  // ---- per-opcode decoders ----
  #decodeStatusChange(bsdp, packet) {
    bsdp.method = "StatusChange";
    this.#decodeState(bsdp, packet.buffer[2]);
    this.#decodeBattery(bsdp, packet.buffer[3]);
    this.#decodeVersion(bsdp, packet.buffer.slice(4, 6).toString("hex"));
    this.#decodeLoraInfo(bsdp);
  }

  #decodeReport(bsdp, packet) {
    bsdp.method = "Report";
    this.#decodeState(bsdp, packet.buffer[2]);
    this.#decodeBattery(bsdp, packet.buffer[3]);
    this.#decodeDelay(bsdp, packet.buffer[4]);
    this.#decodeVersion(bsdp, packet.buffer.slice(5, 7).toString("hex"));
    // Older firmware reports a short (< 9 byte) payload with just a plain
    // delay value; newer firmware adds a 16-bit open-remind-delay/alert
    // interval pair.
    if (packet.buffer.length < 9) {
      this.#decodeDelay(bsdp, packet.buffer[4]);
      bsdp.data.openRemindDelay = null;
    } else {
      this.#decodeDelay(bsdp, Math.round(packet.buffer.readUInt16BE(7) / 60));
      this.#decodeOpenRemindDelay(bsdp, packet.buffer.readUInt16BE(7));
      this.#decodeAlertInterval(bsdp, packet.buffer[4]);
    }
    this.#decodeLoraInfo(bsdp);
  }

  #decodeAlert(bsdp, packet) {
    bsdp.method = "Alert";
    this.#decodeState(bsdp, packet.buffer[2]);
    this.#decodeBattery(bsdp, packet.buffer[3]);
    this.#decodeVersion(bsdp, packet.buffer.slice(4, 6).toString("hex"));
    this.#decodeLoraInfo(bsdp);
  }

  #decodeGetState(bsdp, packet) {
    bsdp.method = "getState";
    this.#decodeState(bsdp, packet.buffer[2]);
    this.#decodeBattery(bsdp, packet.buffer[3]);
    this.#decodeVersion(bsdp, packet.buffer.slice(4, 6).toString("hex"));
    this.#decodeLoraInfo(bsdp);
  }

  #decodeGetVersion(bsdp, buffer) {
    bsdp.method = "getVersion";
    bsdp.data = bsdp.data || {};
    bsdp.data.version = buffer[3].toString() + buffer[2].toString();
    bsdp.data.model = buffer[5].toString() + buffer[4].toString();
  }

  #decodeSetOpenRemind(bsdp, buffer) {
    bsdp.method = "setOpenRemind";
    bsdp.data = bsdp.data || {};
    if (buffer.length < 4) {
      this.#decodeDelay(bsdp, buffer[2]);
    } else {
      this.#decodeDelay(bsdp, Math.round(buffer.readUInt16BE(3) / 60));
      this.#decodeOpenRemindDelay(bsdp, buffer.readUInt16BE(3));
      this.#decodeAlertInterval(bsdp, buffer[2]);
    }
    this.#decodeLoraInfo(bsdp);
  }

  #decodeSetInitState(bsdp, buffer) {
    bsdp.method = "setInitState";
    bsdp.data = bsdp.data || {};
    bsdp.data.initState = { 85: "open", 136: "close", 170: "LastState" }[buffer[2]];
  }

  // Entry point (called by DataPacket base - see data-packet.js): dispatch
  // on the opcode byte.
  _anasysFromPacket() { // [sic] "anasys" - likely a garbled/abbreviated "analysis", used consistently as a naming convention throughout every device handler
    const bsdp = { type: "doorSensor" };
    switch (this.buffer[1]) {
      case 129: this.#decodeStatusChange(bsdp, this); break;
      case 131: this.#decodeReport(bsdp, this); break;
      case 40: this.#decodeAlert(bsdp, this); break;
      case 22: this.#decodeGetVersion(bsdp, this.buffer); break;
      case 23: this.#decodeGetState(bsdp, this); break;
      case 39: this.#decodeSetOpenRemind(bsdp, this.buffer);
    }
    return bsdp;
  }

  // ---- outbound command encoders ----
  genGetState() { return Buffer.from([0, 23]); }
  genGetVersion() { return Buffer.from([0, 22]); }
  genFactoryReset() { return Buffer.from([0, 4, 255, 255]); }

  setOpenRemind(request) {
    const buffer = Buffer.from([0, 39, 255, 255, 255]);
    if (request.params && request.params.delay != null) buffer[2] = request.params.delay;
    if (request.params?.openRemindDelay != null) buffer.writeUInt16BE(request.params.openRemindDelay, 3);
    if (request.params?.alertInterval != null) buffer[2] = request.params.alertInterval;
    return buffer;
  }

  _generateFromBRDP(request) {
    const action = request.method.split(".")[1];
    if (action === "getState") return this.genGetState();
    if (action === "getVersion") return this.genGetVersion();
    if (action === "factoryReset") return this.genFactoryReset();
    if (action === "setOpenRemind") return this.setOpenRemind(request);
  }

  _getDeviceState(bsdp) {
    if (bsdp && bsdp.data && bsdp.data.loraInfo) return bsdp.data;
  }
}

module.exports = { DoorSensor };
