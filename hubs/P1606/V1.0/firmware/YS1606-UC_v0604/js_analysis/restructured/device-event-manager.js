// Original webpack module: 40331 (YoLinkDeviceEventManager)
//
// Per-device registry of "notification rules" (IFTTT / Alexa / Google
// Assistant integrations, plus generic "permanent events"), each scoped
// to a time window and a set of triggering message types. This is what
// decides "should this device event fire a push notification / smart
// assistant update", separate from the LoRa-automation "logics" system
// used elsewhere (see yolink-device.js / yolink-hub.js).

class NotificationRule {
  context;
  constructor(config) {
    this.context = config;
  }

  isInActiveTime(now = new Date()) {
    return this.context.type === "PermanentEvent" || (this.context.endTime != null && this.context.endTime > now.getTime());
  }

  update(config) {
    this.context = config;
  }

  // Different assistant integrations care about different message
  // methods - Alexa/Google Assistant only want state-affecting events,
  // generic rules want everything except "Disconnected".
  asset(bsdp) { // [sic] "asset" - likely meant to be "assert"/"match", kept as found
    if (this.context.action.type === "Alexa") {
      return ["Alert", "StatusChange", "Disconnected", "DevEvent"].includes(bsdp.method);
    }
    if (this.context.action.type === "GA") {
      return ["Alert", "StatusChange", "Disconnected", "setState"].includes(bsdp.method);
    }
    return bsdp.method !== "Disconnected";
  }

  doAction(bsdp, ctx) {
    if (!this.context.action) return;
    if (this.context.action.type === "IFTTT") this.doIFTTTAction(this.context, bsdp, ctx);
    else if (this.context.action.type === "Alexa") this.doAlexaAction(this.context, bsdp, ctx);
    else if (this.context.action.type === "GA") this.doGaAction(this.context, bsdp, ctx);
  }

  // Stubs in the shipped bundle - the actual integration calls presumably
  // live in a native/cloud-side component, not this local process.
  doIFTTTAction(ctx, bsdp, event) {}
  doAlexaAction(ctx, bsdp, event) {}
  doGaAction(ctx, bsdp, event) {}

  destroy() {}
}

class YoLinkDeviceEventManager {
  #events = new Map(); // rule key -> NotificationRule

  addEvent(config) {
    if (config.key && config.type && config.rule && config.action) {
      if (this.#events.has(config.key)) this.#events.get(config.key).update(config);
      else this.#events.set(config.key, new NotificationRule(config));
    }
  }

  removeEvent(config) {
    if (config.key && this.#events.has(config.key)) {
      const rule = this.#events.get(config.key);
      rule.destroy();
      this.#events.delete(config.key);
      return rule;
    }
  }

  // Evaluates every rule against an incoming message; expired
  // (non-permanent, past-endTime) rules are queued for removal rather
  // than deleted mid-iteration.
  checkEvent(bsdp, deviceId) {
    const now = new Date();
    const expiredKeys = [];
    this.#events.forEach((rule, key) => {
      if (rule.isInActiveTime(now)) {
        if (rule.asset(bsdp)) rule.doAction(bsdp, deviceId);
      } else {
        expiredKeys.push(key);
      }
    });
    if (expiredKeys.length > 0) {
      process.nextTick(() => expiredKeys.forEach((key) => this.#events.delete(key)));
    }
  }

  print() {}
}

module.exports = { YoLinkDeviceEventManager };
