// Original webpack module: 53252
//
// Shells out to the system's `loraserver`/`service` commands to check
// and (re)start the local ChirpStack/loraserver process. This is the
// piece that made "manages a real local systemd-style service, not just
// a library" concrete during analysis - see hub-provisioning.js and
// README.md for the fuller picture.

const { exec } = require("child_process"); // original: r(32081)

function checkServerVersion() {
  return new Promise((resolve, reject) => {
    exec("loraserver --version", (err, stdout) => {
      if (err) {
        reject("appliction not available"); // [sic] "appliction"
        return;
      }
      const match = stdout.match(/^loraserver ([\d\.]*)[\s\n]*$/);
      if (match) resolve(match[1]);
      else reject(`application out [${stdout}] not match version pattern`);
    });
  });
}

async function checkServerState(knownStopped) {
  let isStopped = knownStopped;
  if (!isStopped) {
    const state = await new Promise((resolve) => {
      exec("service loraserver status", (err, stdout) => {
        if (err) resolve("stoped"); // [sic] "stoped" used consistently throughout
        else resolve(stdout.indexOf("Active: active") > -1 ? "started" : "stoped");
      });
    });
    logger.info("LoraServerState:" + state);
    isStopped = state === "stoped";
  }
  if (isStopped) {
    try {
      await new Promise((resolve, reject) => {
        exec("service loraserver restart", (err) => { err ? reject(err) : resolve(true); });
      });
    } catch (err) {
      logger.error("Start lora server failed", err);
    }
  }
}

module.exports = { checkServerVersion, checkServerState };
