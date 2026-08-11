// Original webpack module: 95428
const { YLTask, YLTaskGroup } = require("../app-lifecycle");
const { GatewayProfileRepository } = require("../gateway-profile-repository");
const { YLSubnetDevicesRepository } = require("../yl-subnet-devices-repository");
const { YLSubnetInfoRepository } = require("../yl-subnet-info-repository");

module.exports.default = function registerLoadRemoteData(lifecycle) {
  lifecycle.addTask(
    "onPreset",
    new YLTaskGroup("Load Remote Data", [
      new YLTask("Load Gateway Configuration", () => GatewayProfileRepository.of().syncConfig()).ignoreError(),
      new YLTask("Load subnet info", async () => {
        var subnet = await YLSubnetInfoRepository.of().syncConfig();
        if (subnet != null) await YLSubnetDevicesRepository.of().syncConfig(subnet.id, subnet.familyId);
      }).ignoreError(),
    ]).ignoreError(),
    1
  );
};
