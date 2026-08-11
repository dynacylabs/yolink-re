// Original webpack module: 75587
// Same local-cache pattern as yl-subnet-info-repository.js, for the
// per-hub settings blob (currently just the "intergrations" [sic] object
// - see matter-app.js's enableMatter/disableMatter, the only known user
// of this repository so far).
const { getGatewayBaseConfig } = require("./config");
const { LocalStorageItem } = require("./local-storage-item");

class YLSubnetSettingsRepository extends LocalStorageItem {
  static #instance;

  constructor() {
    super("YLSubnetSettings");
  }

  getDefault() {
    return { id: getGatewayBaseConfig().gwId, intergrations: {} }; // [sic] "intergrations"
  }

  async getData() {
    var settings = await this.get(getGatewayBaseConfig().gwId);
    if (settings == null) {
      settings = this.getDefault();
      await this.set(getGatewayBaseConfig().gwId, settings);
    }
    return settings;
  }

  async saveData(settings) {
    await this.set(getGatewayBaseConfig().gwId, settings);
  }

  static of() {
    if (YLSubnetSettingsRepository.#instance === undefined) YLSubnetSettingsRepository.#instance = new YLSubnetSettingsRepository();
    return YLSubnetSettingsRepository.#instance;
  }
}

module.exports = { YLSubnetSettingsRepository };
