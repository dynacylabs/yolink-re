// Original webpack module: 65016
// Same local-cache-then-cloud-fetch pattern as yl-subnet-info-repository.js,
// for the subnet's device list (backs internal-diagnostics-api.js's
// /subnet/devices and hub-remote-commands.js's hub.syncLocalData).
const { getGatewayBaseConfig } = require("./config");
const { LocalStorageItem } = require("./local-storage-item");
const { getSubnetDevices } = require("./lcsubnet-api-client");

class YLSubnetDevicesRepository extends LocalStorageItem {
  static #instance;

  constructor() {
    super("YLSubnetDevices");
  }

  getData() {
    var config = getGatewayBaseConfig();
    return this.get(config.gwId);
  }

  async syncConfig(subnetId, familyId) {
    var config = getGatewayBaseConfig();
    let devices = await getSubnetDevices(subnetId, familyId);
    if (devices?.length) await this.set(config.gwId, devices);
    else await this.del(config.gwId);
    return devices;
  }

  static of() {
    if (YLSubnetDevicesRepository.#instance === undefined) YLSubnetDevicesRepository.#instance = new YLSubnetDevicesRepository();
    return YLSubnetDevicesRepository.#instance;
  }
}

module.exports = { YLSubnetDevicesRepository };
