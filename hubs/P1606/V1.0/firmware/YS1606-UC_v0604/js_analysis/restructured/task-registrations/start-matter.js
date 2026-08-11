// Original webpack module: 3706
//
// Matter (the smart-home interop standard) support, gated behind a
// per-subnet setting (intergrations.matter.enable [sic]) rather than
// always-on. Confirms this hub's local-API story extends to Matter, not
// just YoLink's own app/cloud protocol.

const { YLTask } = require("../app-lifecycle");
const { YLSubnetSettingsRepository } = require("../yl-subnet-settings-repository"); // original module 75587, not yet transcribed - see README
const { MatterApp } = require("../matter-app"); // original module 91373, not yet transcribed - see README

module.exports.default = function registerMatterSupport(lifecycle) {
  lifecycle.addTask(
    "onInit",
    new YLTask("Build Matter RPC Client", async () => {
      MatterApp.register();
    }),
    1
  );

  lifecycle.addEvent("onReady", async () => {
    const settings = await YLSubnetSettingsRepository.of().getData();
    if (settings?.intergrations.matter?.enable === 1) MatterApp.of().start(); // [sic] "intergrations"
  });
};
