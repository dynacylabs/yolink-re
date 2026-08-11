// Original webpack module: 86429 (YLSubnetInfoRepository)
// Same local-cache-then-cloud-fetch pattern as gateway-profile-repository.js,
// for the subnet config used to construct chirpstack-subnet.js's YLSubnet.
const { getGatewayBaseConfig } = require("./config");
const { LocalStorageItem } = require("./local-storage-item");
const { getSubnetInfo } = require("./lcsubnet-api-client"); // original module 37476

class YLSubnetInfoRepository extends LocalStorageItem {
  static #instance;

  constructor() {
    super("YLSubnetInfo");
  }

  getData() {
    const { gwId } = getGatewayBaseConfig();
    return this.get(gwId);
  }

  async syncConfig() {
    const { gwId } = getGatewayBaseConfig();
    const subnetInfo = await getSubnetInfo();
    if (subnetInfo != null) return await this.set(gwId, subnetInfo);
    return await this.del(gwId);
  }

  static of() {
    if (YLSubnetInfoRepository.#instance === undefined) YLSubnetInfoRepository.#instance = new YLSubnetInfoRepository();
    return YLSubnetInfoRepository.#instance;
  }
}

module.exports = { YLSubnetInfoRepository };
