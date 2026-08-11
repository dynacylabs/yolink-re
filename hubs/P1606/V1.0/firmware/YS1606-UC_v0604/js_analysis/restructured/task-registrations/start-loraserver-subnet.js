// Original webpack module: 18784
//
// The two-phase ChirpStack/loraserver startup: first (onInit, priority 2)
// make sure the local loraserver binary is actually running and record
// its version; then (onReady, priority 2) load this hub's subnet config,
// write out /etc/loraserver's config files if the net_id doesn't already
// match (see hub-provisioning-style checkServerConfig), restart the
// server if needed, and provision ChirpStack via YLSubnet.preset().

const { YLTask } = require("../app-lifecycle");
const { YLSubnetInfoRepository } = require("../yl-subnet-info-repository"); // original module 86429, not yet transcribed - see README
const { checkServerVersion, checkServerState } = require("../loraserver-process-control");
const { checkServerConfig } = require("../loraserver-config-writer"); // original module 39054
const { YLSubnet } = require("../chirpstack-subnet");
const { waitForTask } = require("../async-utils");

module.exports.default = function registerLoraServerSubnetTasks(lifecycle) {
  lifecycle.addTask(
    "onInit",
    new YLTask("Check Local LoraServer", async () => {
      try {
        const version = await checkServerVersion();
        logger.info("LoraServer version:" + version);
        app.setContext("loraServerVersion", version);
      } catch (err) {
        logger.error("Check LoraServer failed", err);
      }
    }),
    2
  );

  lifecycle.addTask(
    "onReady",
    new YLTask("Start Subnet", async () => {
      const subnetConfig = await waitForTask(3, () => YLSubnetInfoRepository.of().getData()).catch(() => {});
      if (subnetConfig == null) {
        logger.error("No subnet found, ignore lan");
        return;
      }
      const subnet = new YLSubnet(subnetConfig);
      app.context.registerSubnet(subnet);
      checkServerConfig();
      await checkServerState(false);
      await waitForTask(3, () => subnet.preset());
      logger.info("preset subnet success");
      app.getGateway().attachSubnet();
      subnet.start();
    }),
    2
  );
};
