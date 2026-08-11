// Original webpack module: 47236 (YoLinkDevice)
//
// The live, in-memory representation of one LoRaWAN sensor/actuator
// device (door sensor, motion sensor, outlet, etc.) - as opposed to
// yolink-hub.js's YoLinkHub, which represents a bridged legacy hub. Owns
// message handling, per-device automation ("logics"), and forwarding
// replies back to whichever app/cloud client is waiting on them.

const { Device } = require("./device-base"); // original module 70868
const { YoLinkDeviceEventManager } = require("./device-event-manager");
const { LoraUpLinkDataPacket, LoraDownlinkDataPacket } = require("./lora-packet-codec");
const { NSDownlinkWraper } = require("./ns-downlink-wrapper"); // original module 70409 [sic] "Wraper"
const { CallbackPools } = require("./callback-pools");
const { saveState } = require("./device-state-store"); // original module 62937
const { DeviceAutomation } = require("./automation"); // original module 57926

class YoLinkDevice extends Device {
  logics = [];
  emitter;
  deviceSession;
  customerReportCnl;
  customerId;
  deviceEventManage;
  extInfo;
  forwardCalls;

  constructor(deviceId, dispatcher, deviceSession) {
    super(deviceId, dispatcher);
    this.forwardCalls = new CallbackPools();
    this.deviceSession = deviceSession;
    this.deviceEventManage = new YoLinkDeviceEventManager();
    this.extInfo = {};
  }

  onInit() {
    super.onInit();
    if (this.deviceSession?.permanentEvents != null) {
      this.deviceSession.permanentEvents.forEach((event) => {
        logger.info(`Load PermanentEvent ${event.key} from session`);
        this.deviceEventManage.addEvent(event);
      });
    }
    this.loadLogics();
  }

  // The hot path: a LoRaWAN uplink for this device arrived. Decodes it,
  // updates session/state, forwards to the app as MQTT, resolves any
  // pending forwardCalls (app requests that are waiting on this exact
  // reply), and runs automation logic.
  async onReceiveMessage(rawPayload, event) {
    try {
      const packet = new LoraUpLinkDataPacket(rawPayload);
      this.deviceSession.resolveDevClassType(packet);
      const bsdp = await this.deviceSession.genBSDP(packet);
      if (bsdp == null) throw new Error("Invalid Uplink Message");

      this.extInfo.loraInfo = packet.loraInfo;
      this.extInfo.appInfo = packet.appInfo;
      if (packet.loraInfo.netId != null) this.deviceSession.setLoraNetId(packet.loraInfo.netId);
      if (this.deviceSession && this.deviceSession.onDeviceMessage2) {
        await this.deviceSession.onDeviceMessage2(this, packet);
      }

      const currentState = this.deviceSession.genCurrentState(packet);
      if (currentState) {
        await saveState(this.deviceId, { deviceState: currentState }, { extend: true }).catch(() => {});
      }

      await this.handleLogic(rawPayload, event, packet);
      this.sendMqttMessage(Object.assign(bsdp, { deviceId: this.deviceId }), `/ys/${this.deviceId}/rx`);

      if (bsdp && bsdp.type !== "firmware") {
        let forwarded = false;
        if (!(bsdp.seq && bsdp.seq.pendding)) {
          forwarded = this.forwardCalls.doCallback(`${bsdp.type}.${bsdp.method}`, bsdp, rawPayload);
          logger.info("Forward result:" + forwarded);
        }
      }
    } catch (err) {
      logger.error(err);
      logger.error(err, "Handle Message Error");
    } finally {
      this.deviceSession.autoSave();
    }
  }

  async onReceiveOfflineEvent() {
    if (this.deviceSession != null && this.deviceSession.supportOfflineEvent() === false) return;
    const offlineEvent = {
      method: "Unreachable",
      type: this.deviceSession.deviceType,
      data: { online: false },
      deviceId: this.deviceId,
      seq: Date.now(),
    };
    this.sendMqttMessage(offlineEvent, `/ys/${this.deviceId}/rx`);
    this.deviceEventManage.checkEvent(offlineEvent, this.deviceId);
    if (this.customerReportCnl) this.sendMqttMessage(offlineEvent, this.customerReportCnl, undefined);
    if (this.deviceSession != null) {
      this.deviceSession.setOnline(false);
      this.deviceSession.autoSave();
    }
  }

  async loadLogics() {
    logger.info("load automation of client:%s", this.deviceId);
    const logicConfigs = await getDeviceLogics(this.deviceId); // original module 69159
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

  sendMqttMessage(payload, channel, clientId) {
    const now = Date.now();
    payload = Object.assign({ msgid: now + "", ser: (now % 1e7) + "" }, payload);
    this.dispatcher.sendMqttMessage({ channel: channel || "/" + this.deviceId + "/cc", payload, clientId: clientId || undefined });
  }

  // Runs every registered automation rule against this message, in
  // "minutes since midnight" + day-of-week terms so time-window rules
  // (e.g. "only 9pm-6am") can evaluate cheaply.
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
    const bsdp = packet.getBSDP();
    if (bsdp != null) this.deviceEventManage.checkEvent(bsdp, this.deviceId);
  }

  async handleSysAppCommand(command, ctx) {
    if (command.method === "sys.refreshCustomer" || command.method === "sys.refreshYoLinkFamily") {
      if (this.deviceSession) {
        this.deviceSession.loadYoLinkFamilyId((err) => { if (err == null) this.deviceSession.autoSave(); });
      }
    }
  }

  // App-originated command dispatch: registers a forward-callback if the
  // caller wants an async reply routed back to a specific channel, then
  // tries "automation reload" commands before falling through to an
  // actual LoRa downlink.
  async handleAppCommand(command, ctx) {
    if (command.from && command.from.forward) {
      this.forwardCalls.addCallback(
        command.method,
        command,
        (result) => {
          if (command.seq && command.seq.ser) result.ser = command.seq.ser;
          this.sendMqttMessage(result, command.from.forward.channel, undefined);
        },
        { timeout: command.from.forward.timeout }
      );
    }
    if (command.method && command.method.indexOf("sys.") === 0) return this.handleSysAppCommand(command, ctx);

    let error, result;
    try {
      result = (await this.handleAutomationReload(command)) || (await this.handleLoraPacket(command));
    } catch (err) {
      error = err;
      logger.error("Handle App Command Error", err);
    }

    if (command.rchl != null || ctx.channel != null) {
      if (error) {
        logger.error(error, "Handle App Command Fail");
        this.sendMqttMessage(
          { type: command.method.split(".")[0], method: command.method.split(".")[1], status: "Fail", deviceId: this.deviceId },
          command.rchl || ctx.channel.replace("/tx", "/rx")
        );
      } else if (result && result !== true) {
        const reply = {
          type: command.method.split(".")[0],
          method: command.method.split(".")[1],
          data: result,
          status: "ok",
          deviceId: this.deviceId,
        };
        this.sendMqttMessage(reply, command.rchl || ctx.channel.replace("/tx", "/rx"));
        if (command?.from?.forward?.channel != null) {
          process.nextTick(() => this.forwardCalls.doCallback(`${reply.type}.${reply.method}`, reply, ctx));
        }
      }
    }
  }

  // Encodes an app command into a downlink and hands it to the LoRaWAN
  // network server (via NSDownlinkWraper) for actual transmission.
  async handleLoraPacket(command) {
    const downlink = new LoraDownlinkDataPacket(this.extInfo.appInfo?.appEUI ?? this.deviceSession.appId, command);
    if (this.deviceSession != null) this.deviceSession.handleAppCommand(command, this);
    const encoded = downlink.getEncoded();
    if (encoded && encoded.length) {
      await NSDownlinkWraper.get(this.deviceSession.loraNetId).sendDeviceCommand(this.deviceId, encoded, { fPort: 1 });
      // Class A devices only get a downlink opportunity right after their
      // own uplink, so the caller needs to know whether one was actually
      // queued vs. sent immediately.
      return !(this.extInfo.devClassType === "ClassA" || this.deviceSession?.devClassType === "ClassA") || {};
    }
    if (encoded != null) return {};
    throw new Error("Error Message");
  }

  async handleAutomationReload(command) {
    if (command.method === "automation.refresh") {
      this.loadLogics();
      return {};
    }
    if (command.method.endsWith(".addEvent")) {
      logger.info(command);
      this.deviceEventManage.addEvent(command.params);
      this.deviceEventManage.print();
      if (command.params.type === "PermanentEvent" && this.deviceSession != null) {
        this.deviceSession.addPermanentEvent(command.params);
      }
      return {};
    }
    if (command.method.endsWith(".removeEvent")) {
      logger.info(command);
      const removed = this.deviceEventManage.removeEvent(command.params);
      this.deviceEventManage.print();
      if (removed && removed.context.type === "PermanentEvent" && this.deviceSession != null) {
        this.deviceSession.removePermanentEvent(removed.context);
      }
      return {};
    }
    return false;
  }
}

module.exports = { YoLinkDevice };
