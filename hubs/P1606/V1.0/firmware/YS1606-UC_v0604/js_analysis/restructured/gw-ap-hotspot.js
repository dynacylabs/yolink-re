// Original webpack module: 34303
//
// Wraps a separate OS-level shell script, `gw_ap.sh` (not present
// anywhere in this JS bundle - lives elsewhere in the firmware image,
// not yet located in this repo), which actually owns starting/stopping
// the wifi AP-mode hotspot. Invoked by gateway-key-event.js's long-press
// handler.

const { spawn } = require("child_process");

function runApScript(args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      const proc = spawn("gw_ap.sh", args);
      const chunks = [];
      proc.stdout.on("data", (data) => chunks.push(data));
      proc.stderr.on("data", (data) => {
        if (!settled) { settled = true; reject(data.toString()); }
      });
      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          try {
            if (code !== 0) return reject(code);
            resolve(chunks.join(""));
          } catch (e) {
            reject(e);
          }
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function startHotspot() {
  return runApScript(["start"]).then(() => true);
}

function stopHotspot() {
  return runApScript(["stop"]).then(() => true);
}

function statHotspot() {
  return runApScript(["status"]).then((status) => status == "running");
}

module.exports = { startHotspot, stopHotspot, statHotspot };
