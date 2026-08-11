// Original webpack module: 39319
//
// The actual real-time clock trigger for time/schedule-based automation
// rules - fires every minute (node-schedule cron "0 */1 * * * *") and
// calls automation-engine.js's handleAutomation() with a synthetic
// "Schedule"-type event whose key is the current minute-of-day
// (local-time-adjusted, matching the encoding used throughout
// automation-time-window.js/automation-engine.js's checkTimeValid).
// This is what makes schedule-triggered automations (as opposed to
// device-state-change-triggered ones) actually fire.

const { scheduleJob } = require("node-schedule"); // original module 54221
const { handleAutomation } = require("./automation-engine");

class Schedule {
  job;

  start() {
    this.job = scheduleJob("0 */1 * * * *", (fireDate) => {
      logger.debug("Fetch Schedule Job fired at : " + fireDate + ";Next fire at:" + this.job.nextInvocation());
      process.nextTick(() => {
        this.run();
      });
    });
  }

  run() {
    var now = new Date();
    let minuteKey = (60 * now.getHours() + now.getMinutes() + now.getTimezoneOffset() + 1440) % 1440;
    handleAutomation({
      type: "Schedule",
      action: "schedule",
      key: `${minuteKey}`,
      time: Date.now(),
      data: { week: now.getDay(), hour: now.getHours(), minute: now.getMinutes() },
    }).catch((e) => {});
  }

  triggerAutomation() {}
}

module.exports = { Schedule };
