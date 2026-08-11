// Original webpack module: 11292
const { YLTask } = require("../app-lifecycle");
const { getGatewayBaseConfig } = require("../config");
const { loadConfiguraiton } = require("../gateway-profile-repository");
const { LoraClient } = require("../lora-transport");
const { Gateway } = require("../gateway");

module.exports.default = function registerStartLocalGateway(lifecycle) {
  lifecycle.addTask(
    "onReady",
    new YLTask("Start local gateway", async () => {
      const { gwId, gwSecret } = getGatewayBaseConfig();
      const gwConfig = await loadConfiguraiton(gwId, gwSecret);
      const loraClient = LoraClient.of();
      const gateway = new Gateway(loraClient, gwConfig, gwSecret);
      app.context.registerGateway(gateway);
    }),
    1
  );
};
