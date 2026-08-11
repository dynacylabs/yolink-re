// Original webpack modules: 26644 (GatewayProfileRepository), 50964
// (loadConfiguraiton [sic])
//
// Caches the gateway's own configuration (fetched from YoLink's cloud via
// hub-provisioning.js's fetchGatewayConfiguration) in local storage, keyed
// by gwId, so the hub doesn't need network access to know its own config
// on every boot.

const { getGatewayBaseConfig } = require("./config");
const { LocalStorageItem } = require("./local-storage-item"); // original module 2746, not yet transcribed - see README
const { fetchGatewayConfiguration } = require("./hub-provisioning");

class GatewayProfileRepository extends LocalStorageItem {
  static #instance;

  static of() {
    if (GatewayProfileRepository.#instance === undefined) {
      GatewayProfileRepository.#instance = new GatewayProfileRepository();
    }
    return GatewayProfileRepository.#instance;
  }

  constructor() {
    super("GatewayProfile");
  }

  getConfig() {
    const { gwId } = getGatewayBaseConfig();
    return this.get(gwId);
  }

  async syncConfig() {
    const { gwId, gwSecret } = getGatewayBaseConfig();
    const config = await fetchGatewayConfiguration(gwId, gwSecret);
    await this.set(gwId, config);
    return config;
  }
}

// Tries the local cache first, falls back to a live fetch from the cloud.
async function loadConfiguraiton(gwId, gwSecret) {
  let config;
  try {
    config = await GatewayProfileRepository.of().getConfig();
  } catch (err) {
    logger.warn("Load local gateway config failed", err);
  }
  if (config == null) {
    try {
      config = await GatewayProfileRepository.of().syncConfig();
    } catch (err) {
      logger.warn("Load remote gateway config failed", err);
    }
  }
  if (config == null) throw new Error("No configuration found");
  return config;
}

module.exports = { GatewayProfileRepository, loadConfiguraiton };
