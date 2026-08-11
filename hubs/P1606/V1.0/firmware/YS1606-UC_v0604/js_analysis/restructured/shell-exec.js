// Original webpack module: 67043
//
// Generic shell-command-via-exec() helper - distinct from nmcli-wrapper.js's
// cli()/clib() (which specifically spawn "nmcli"). Used by upgrade-task.js
// to run `tar -zxvf ...`.
const { exec } = require("child_process");

function cli(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err == null) resolve({ code: 0, stderr, stdout });
      else reject(err);
    });
  });
}

module.exports = { cli };
