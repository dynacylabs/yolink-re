// Original webpack module: 28662
const { Schedule } = require("../schedule-job");

module.exports.default = function registerScheduleStart(lifecycle) {
  lifecycle.addEvent("onReady", async () => {
    new Schedule().start();
  });
};
