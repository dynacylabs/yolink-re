// Original webpack module: 56093 (YoLinkHub)
//
// *** This is the file that shows P1606 can bridge older YoLink hubs. ***
// A YoLinkHub instance represents a legacy hub (P1603/P1604/P1605-family)
// that has connected TO this P1606 as if it were just another managed
// device - not a peer. `isSupportAutomation` is set by testing the
// device ID against /^[\w]{6}1605/, i.e. "does this connected hub's ID
// encode product number 1605" (YoLink device IDs are structured as a
// fixed prefix + product number + serial, matching the "d88b4c" + model
// pattern seen throughout this bundle). Automation ("logics") is only
// enabled for bridged hubs that pass that check - implying P1606 was
// built, at least in part, as a way to bring the previous hub generation
// into the same automation/ChirpStack-backed system as everything else,
// rather than being a pure standalone replacement.

const { Device } = require("./device-base");
const { HubUpLinkDataPacket, HubDownlinkDataPacket } = require("./lora-packet-codec");
const { CallbackPools } = require("./callback-pools");
const { saveState } = require("./device-state-store");
const { DeviceAutomation } = require("./automation");

class YoLinkHub extends Device {
  logics = [];
  deviceSession;
  forwardCalls;
  offlineNotifyTimer;
  isSupportAutomation;

  constructor(deviceId, dispatcher, deviceSession) {
    super(deviceId, dispatcher);
    this.deviceSession = deviceSession;
    // See file header - this is the P1605-bridge detection.
    this.isSupportAutomation = /^[\w]{6}1605/.test(this.deviceId);
    this.forwardCalls = new CallbackPools();
  }

  onInit() {
    if (this.isSupportAutomation) this.loadLogics();
  }

  async onReceiveMessage(rawPayload, event) {
    const packet = new HubUpLinkDataPacket(rawPayload);
    const bsdp = packet.getBSDP();
    if (bsdp) {
      this.sendMqttMessage(bsdp, `/ys/${this.deviceId}/rx`);
      const forwarded = this.forwardCalls.doCallback(`${bsdp.type}.${bsdp.method}`, bsdp, rawPayload);
      logger.info("Forward result:" + forwarded);

      if (!forwarded && bsdp.method === "StatusChange" && this.deviceSession?.hasCustomerId() === true) {
        this.sendMqttMessage(bsdp, this.deviceSession.getCustomerReportTopic(), undefined);
      }

      if (bsdp.method === "getState" || bsdp.method === "StatusChange") {
        const state = { online: true };
        state.remoteIP = this.deviceSession.remoteIp;
        state.eth = bsdp?.data?.eth;
        state.wifi = bsdp?.data?.wifi;
        state.lte = bsdp?.data?.lte;
        state.other = bsdp?.data?.other;
        state.version = bsdp?.data?.version;
        state.location = this.deviceSession.location;
        if (bsdp?.data?.options) state.options = bsdp?.data?.options;
        saveState(this.deviceId, { deviceState: state }, { extend: true }).catch(() => {});
      }
      // `bsdp.data.cause` is read here but the result is discarded in the
      // original bundle - possibly dead code, possibly meant for a
      // logging call that got optimized away. Kept as-is.
      if (bsdp.method === "StatusChange") bsdp.data.cause;
    }
    if (this.isSupportAutomation) await this.handleLogic(rawPayload, event, packet);
    this.deviceSession.autoSave();
  }

  sendMqttMessage(payload, channel, clientId) {
    const now = Date.now();
    payload = Object.assign({ msgid: now + "", ser: (now % 1e7) + "", deviceId: this.deviceId }, payload);
    this.dispatcher.sendMqttMessage({ channel: channel || "/ys/" + this.deviceId + "/rx", payload, clientId: clientId || undefined });
  }

  // Distinct from sendMqttMessage: goes out on a "ylgw470/..." topic
  // rather than the "/ys/..." namespace - presumably the bridge/gateway
  // channel used specifically for talking back to a legacy physical hub,
  // as opposed to the app-facing report channel.
  sendHubMQTTMessage(payload, channel, clientId) {
    const now = Date.now();
    payload = Object.assign({ msgid: now + "", ser: (now % 1e7) + "", deviceId: this.deviceId }, payload);
    this.dispatcher.sendMQTTBridgeMessage({ channel, payload, clientId: clientId || undefined });
  }

  async handleSysAppCommand(command, ctx) {
    if (command.method === "sys.refreshYoLinkFamily" && this.deviceSession) {
      this.deviceSession.loadYoLinkFamilyId((err) => { if (err == null) this.deviceSession.autoSave(); });
    }
  }

  async handleAppCommand(command, ctx) {
    if (command.method && command.method.indexOf("sys.") === 0) return this.handleSysAppCommand(command, ctx);

    if (this.isSupportAutomation && command.method === "automation.refresh") {
      this.loadLogics();
      this.sendMqttMessage(
        { type: command.method.split(".")[0], method: command.method.split(".")[1], data: {}, status: "ok", deviceId: this.deviceId },
        command.rchl || ctx.channel.replace("/tx", "/rx")
      );
      return;
    }

    const encoded = new HubDownlinkDataPacket(command).getEncoded();
    if (encoded) {
      // Playing custom audio (vs. a built-in message) needs a URI, not
      // just a message string - if neither is present, drop the command.
      if (command?.method === "hub.playAudio" && encoded?.uri == null && encoded?.message != null) return;
      this.sendHubMQTTMessage(encoded, `ylgw470/${this.deviceId}/admin`);
    }
  }

  async onConnected(_payload) {
    const statusEvent = { type: "hub", method: "StatusChange", data: { online: true } };
    this.sendMqttMessage(statusEvent);
    if (this.deviceSession?.hasCustomerId() === true) {
      setTimeout(() => {
        if (this.deviceSession == null || this.deviceSession?.online !== true) {
          this.sendMqttMessage(statusEvent, this.deviceSession.getCustomerReportTopic(), undefined);
        }
      }, 200);
    }
    try {
      if (this.deviceSession != null) this.deviceSession.setOnline(true);
      await saveState(
        this.deviceId,
        { deviceState: { online: true, remoteIP: this.deviceSession?.remoteIp, location: this.deviceSession?.location } },
        { extend: true }
      );
    } finally {
      if (this.deviceSession != null && this.deviceSession.updatedAt == null) {
        this.deviceSession.updatedAt = new Date();
        this.deviceSession.needSave = true;
      }
      if (this.deviceSession != null) this.deviceSession.autoSave();
      else logger.error("Don't have device session " + this.deviceId);
      setTimeout(() => {
        if (this.offlineNotifyTimer != null) {
          clearTimeout(this.offlineNotifyTimer);
          this.offlineNotifyTimer = undefined;
        }
      }, 1000);
    }
  }

  async onDisConnected() {
    const statusEvent = { type: "hub", method: "StatusChange", data: { online: false } };
    this.sendMqttMessage(statusEvent);
    if (this.deviceSession?.hasCustomerId() === true) {
      this.sendMqttMessage(statusEvent, this.deviceSession.getCustomerReportTopic(), undefined);
    }
    if (this.deviceSession != null) {
      this.deviceSession.setOnline(false);
      this.deviceSession.updatedAt = new Date();
      this.deviceSession.needSave = true;
      this.deviceSession.autoSave();
    }
    saveState(this.deviceId, { deviceState: { online: false } }, { extend: true }).catch(() => {});
  }

  destroy(_callback) {
    if (this.offlineNotifyTimer) clearTimeout(this.offlineNotifyTimer);
  }

  async loadLogics() {
    logger.info("load automation of client:%s", this.deviceId);
    const logicConfigs = await getDeviceLogics(this.deviceId);
    this.clearLogics();
    logicConfigs.forEach((config) => {
      try {
        this.addLogics(config);
      } catch (err) {
        logger.error(err, "Failed to load logic ");
      }
    });
  }

  clearLogics() {
    while (this.logics.length > 0) this.logics.shift().destroy();
  }

  addLogics(config) {
    this.logics.push(DeviceAutomation.autoInstance(config, this));
  }

  async handleLogic(rawPayload, event, packet) {
    const now = new Date();
    const minutesSinceMidnight = 60 * now.getHours() + now.getUTCMinutes();
    const dayOfWeek = now.getDay();
    logger.info("Start Handle Logic:", { deviceId: this.deviceId });
    this.logics.forEach((logic) => {
      if (logic.enable && logic.isInActiveTime(minutesSinceMidnight, dayOfWeek, now) && logic.assert(packet.getBSDP())) {
        logic.handle(packet);
      }
    });
  }
}

module.exports = { YoLinkHub };
