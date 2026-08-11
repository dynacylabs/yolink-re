// Original webpack module: 68213
// The actual driver for hub-provisioning.js's status-LED loop (invoked
// via the app's `--loop` CLI flag, see app.js). Once checkEnv() confirms
// the hub is provisioned, polls checkStatus() every second forever.
// (original module 95204's waitForMS is functionally identical to
// delay-utils.js's delayMs, reused here rather than duplicated.)
//
// NOTE: checkStatus (also original module 37309, alongside checkEnv) is
// NOT yet exported from hub-provisioning.js - that file's own header
// notes it was "transcribed only partially." The import below is
// accurate to the source's structure but will need hub-provisioning.js
// updated with a real checkStatus export before this is runnable.
const { delayMs } = require("./delay-utils");
const { checkEnv, checkStatus } = require("./hub-provisioning");

function startLoop() {
  checkEnv().then(async (provisioned) => {
    if (provisioned) {
      for (;;) {
        await checkStatus();
        await delayMs(1000);
      }
    }
  });
}

module.exports = { startLoop };
