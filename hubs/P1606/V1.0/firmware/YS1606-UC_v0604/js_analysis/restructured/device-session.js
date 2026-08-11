// Original webpack modules: 11511 (DeviceSession), 40610 (YoLinkHubSession)
//
// A DeviceSession is the persisted (Redis-backed, see
// redis-session-dao.js) state for one device: what type it is, its LoRa
// network id, timezone/locale, battery, which hub(s) it's paired through,
// "permanent events" (automations that should survive a reload), and
// whether it's currently online. One instance lives in memory per active
// device (see message-dispatcher.js's device caches) and is loaded/saved
// against Redis on demand.

const { find } = require("lodash-find"); // original module 74979 - likely a single-function lodash import, not the full library
const { YoLinkDeviceSessionDao } = require("./redis-session-dao");

class DeviceSession {
  serviceId;
  appId;
  loraNetId;
  needSave;
  deviceId;
  deviceType;
  currentState;
  lastAlertTime;
  online;
  tz;
  battery;
  permanentEvents;
  updatedAt;
  location;
  locale;
  hubs;
  devClassType;
  yolinkFamilyId;
  p2pTableHash;

  constructor(deviceId, appId) {
    if (!deviceId) throw new Error("Device Id can't be null");
    this.devClassType = "ClassC";
    this.deviceId = deviceId;
    this.appId = appId;
    this.hubs = [];
    this.needSave = true;
    if (this.onInit) this.onInit();
  }

  onInit() {}

  isHubChanged(hubId) {
    return this.hubs != null && this.hubs.length !== 0 && find(this.hubs, hubId) != null;
  }

  // Debounces repeated "Alert" messages to at most one per 3 seconds.
  isValidAlert(bsdp) {
    return bsdp.method === "Alert" && (this.lastAlertTime == null || this.lastAlertTime.getTime() < Date.now() - 3000);
  }

  genCurrentState(packet) {
    return packet.getDeviceState(packet.getBSDP());
  }

  // NOTE: this looks incomplete in the original bundle too - it computes
  // a value but never assigns or returns it. Kept faithful to the shipped
  // behavior rather than "fixed", since it's not clear whether this was a
  // real bug or dead code left over from a refactor.
  resolveDevClassType(packet) {
    packet.loraInfo.devNetType != null && packet.loraInfo.devNetType !== "" || this.devClassType;
  }

  genBSDP(packet) {
    if (this.appId == null && packet?.appInfo?.appEUI != null) {
      this.appId = packet.appInfo.appEUI;
      this.needSave = true;
    }
    return Promise.resolve(packet.getBSDP());
  }

  // Hook points for subclasses (see yolink-device.js) - base
  // implementation is a no-op that just resolves any provided callback.
  genLog(packet, callback) { if (callback) callback(undefined, undefined); }
  genAlert(packet, callback) { if (callback) callback(undefined, undefined); }
  handleAppCommand(payload, ctx) {}
  onDeviceMessage2(packet, ctx) { return Promise.resolve(undefined); }

  onDeviceMessage(packet) {
    [this.genCurrentState, this.genLog, this.genAlert].forEach((fn) => fn.call(this, packet, undefined));
  }

  save() {
    YoLinkDeviceSessionDao.getInstance()
      .saveDeviceSession(this.deviceId, this.toJson())
      .then((saved) => { if (saved) this.needSave = false; })
      .catch((err) => logger.error(err, "Save device session failed"));
  }

  autoSave() {
    if (this.needSave) this.save();
  }

  toJson() {
    return {
      deviceId: this.deviceId,
      appId: this.appId,
      loraNetId: this.loraNetId,
      deviceType: this.deviceType,
      serviceId: this.serviceId,
      permanentEvents: this.permanentEvents,
      tz: this.tz,
      location: this.location,
      locale: this.locale,
      updatedAt: this.updatedAt == null ? undefined : this.updatedAt.getTime(),
      hubs: this.hubs,
      devClassType: this.devClassType,
      online: this.online,
      yolinkFamilyId: this.yolinkFamilyId,
      battery: this.battery,
      p2pTableHash: this.p2pTableHash,
    };
  }

  loadWithJson(json) {
    this.serviceId = json.serviceId;
    this.permanentEvents = json.permanentEvents;
    this.tz = json.tz;
    this.updatedAt = json.updatedAt == null ? undefined : new Date(json.updatedAt);
    this.loraNetId = json.loraNetId;
    this.location = json.location;
    this.locale = json.locale;
    this.hubs = json.hubs;
    this.online = json.online;
    this.yolinkFamilyId = json.yolinkFamilyId;
    this.battery = json.battery;
    this.p2pTableHash = json.p2pTableHash;
  }

  setLoraNetId(v) { if (v != null && this.loraNetId !== v) { this.loraNetId = v; this.needSave = true; } }
  setTimeZone(v) { if (v != null && v !== this.tz) { this.tz = v; this.needSave = true; } }
  setOnline(v) { if (v != null && v !== this.online) { this.online = v; this.needSave = true; } }

  // Class A/D devices sleep between transmissions and are given a much
  // longer "still online" grace period (45s) than always-listening
  // Class C devices (5.6s).
  getYLOnlineTimeoutMS() {
    return this.devClassType === "ClassA" || this.devClassType === "ClassD" ? 45000 : 5600;
  }

  addPermanentEvent(event) {
    if (this.permanentEvents == null) this.permanentEvents = [];
    if (find(this.permanentEvents, (e) => e.key === event.key) == null) {
      this.permanentEvents.push(event);
      this.save();
    }
  }

  removePermanentEvent(event) {
    if (this.permanentEvents == null || this.permanentEvents.length === 0) return;
    const idx = this.permanentEvents.findIndex((e) => e.key === event.key);
    if (idx > -1) {
      logger.info("Remove PermaenetEvent from Session Success."); // [sic] "PermaenetEvent"
      this.permanentEvents.splice(idx, 1);
      this.save();
    }
  }

  autoFetchYoLinkFamilyId(callback) {
    callback(undefined, this.yolinkFamilyId);
  }

  loadYoLinkFamilyId(callback) {
    YoLinkDeviceSessionDao.getInstance()
      .getCurrentYoLinkFamily(this.deviceId)
      .then((familyId) => {
        if (familyId == null) throw new Error("No Family Id");
        return familyId;
      })
      .then((familyId) => {
        this.yolinkFamilyId = familyId;
        this.needSave = true;
        callback(undefined, this.yolinkFamilyId);
      })
      .catch((err) => callback(err));
  }

  supportOfflineEvent() {
    return true;
  }
}

// Adds the fields specific to a *hub's* own session (as opposed to a
// downstream sensor/device): which IP it last connected from, and an
// optional linked "customer" id used to build a dedicated MQTT report
// topic for that customer's account.
class YoLinkHubSession extends DeviceSession {
  remoteIp;
  customerId;

  toJson() {
    const json = super.toJson();
    json.remoteIp = this.remoteIp;
    json.customerId = this.customerId;
    return json;
  }

  loadWithJson(json) {
    super.loadWithJson(json);
    this.remoteIp = json.remoteIp;
    this.customerId = json.customerId;
  }

  setCustomerId(id) { this.customerId = id; this.needSave = true; }
  hasCustomerId() { return this.customerId != null; }

  getCustomerReportTopic() {
    if (this.hasCustomerId()) return "ys/as/cus/" + this.customerId + "/rep";
  }
}

module.exports = { DeviceSession, YoLinkHubSession };
