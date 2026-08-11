// Original webpack modules: 11331 (YLAutomationRepository), 69159
// (getDeviceLogics/getByTriggerKey)
//
// Persists automation rule configs (see automation.js) to local storage,
// partitioned per-subnet (one repository instance per subnetId, cached).

const { LocalStorageItem } = require("./local-storage-item");
const { v4: uuidv4 } = require("./uuid"); // original module 57376

class YLAutomationRepository extends LocalStorageItem {
  static #instancesBySubnet = new Map();

  constructor(subnetId) {
    super("YLAutomation-" + subnetId);
  }

  getData() {
    return this.getAll();
  }

  addData(rule) {
    if (!rule.id) rule.id = uuidv4();
    return this.set(rule.id, rule);
  }

  async getDeviceAutomationsByDeviceId(deviceId) {
    return (await this.getAll()).filter((rule) => rule.type === "Device" && rule.triggerDeviceId === deviceId);
  }

  static of(subnetId) {
    let instance = YLAutomationRepository.#instancesBySubnet.get(subnetId);
    if (!instance) {
      instance = new YLAutomationRepository(subnetId);
      YLAutomationRepository.#instancesBySubnet.set(subnetId, instance);
    }
    return instance;
  }
}

// Used by yolink-device.js/yolink-hub.js's loadLogics().
function getDeviceLogics(deviceId) {
  const subnetId = app.getSubnetId();
  if (subnetId == null) return Promise.reject("No subnet found");
  return YLAutomationRepository.of(subnetId)
    .getDeviceAutomationsByDeviceId(deviceId)
    .then((rules) => rules ?? []);
}

// NOTE: this looks incomplete in the original bundle - the filter
// callback's body never actually returns a boolean, so this effectively
// returns every enabled rule of the matching type regardless of key/action.
// Kept faithful to shipped behavior rather than "fixed."
function getByTriggerKey(query) {
  const subnetId = app.getSubnetId();
  if (subnetId == null) return Promise.reject("No subnet found");
  return YLAutomationRepository.of(subnetId)
    .getAll()
    .then((rules) =>
      rules.filter((rule) => {
        rule.type === query.type && rule.enable === 1 && rule.triggerRule.key === query.key && (rule.triggerRule.action, query.action);
      })
    );
}

module.exports = { YLAutomationRepository, getDeviceLogics, getByTriggerKey };
