// Original webpack modules: 45844 (thin wrapper) -> 39377 (the actual task)
const { YLTask } = require("../app-lifecycle");
const { LinuxSocketPipe, LoraClient } = require("../lora-transport");
const { getLoraDriverConfig } = require("../config");

module.exports.default = function registerConnectLoraModule(lifecycle) {
  lifecycle.addTask(
    "onInit",
    new YLTask("Connect to lora module", async () => {
      const pipe = new LinuxSocketPipe(getLoraDriverConfig().path);
      await pipe.start();
      LoraClient.registerWith(pipe);
    }),
    2
  );
};
