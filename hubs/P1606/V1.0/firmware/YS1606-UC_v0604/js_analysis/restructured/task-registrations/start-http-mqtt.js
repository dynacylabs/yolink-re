// Original webpack module: 23969
const { YLTask, YLTaskGroup } = require("../app-lifecycle");
const { start: startHttpServer } = require("../http-server"); // original module 60184
const { startLocalMqttServer } = require("../mqtt-local-broker");

module.exports.default = function registerHttpAndMqttServers(lifecycle) {
  lifecycle.addTask(
    "onInit",
    new YLTaskGroup("Start HTTP & MQTT Server", [
      new YLTask("Start HTTP Server", async () => { await startHttpServer(1080); }),
      new YLTask("Start MQTT Server", async () => { await startLocalMqttServer(18080); }),
    ]),
    1
  );
};
