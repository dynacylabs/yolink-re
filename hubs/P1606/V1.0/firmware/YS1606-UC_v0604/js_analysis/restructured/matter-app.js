// Original webpack module: 91373
//
// Manages the hub's Matter (smart-home interop protocol) integration as a
// separate child process (`node /usr/lib/integrations/matter/main.js`),
// controlled via hub-remote-commands.js's hub.getMatterState/setMatter/
// resetMatter commands and an RPC client (MatterRPCClient, original
// module 76630, not yet examined).
//
// FINDING: the default Matter commissioning passcode is hardcoded to
// 11111111 (`?? 11111111` - only used if none was ever set) - Matter's
// spec explicitly reserves passcode 00000000 and a handful of other
// values as invalid, but doesn't forbid this one; it's still a
// predictable default rather than a randomly generated per-device value,
// consistent with every other "shared secret" already found in this
// bundle (see the README's Findings section).

const { exec } = require("child_process");
const { MatterRPCClient } = require("./matter-rpc-client");
const { YLSubnetSettingsRepository } = require("./yl-subnet-settings-repository");
const { getLogger } = require("./logger");
const fs = require("fs");
const { delayMs } = require("./delay-utils");

const DEFAULT_PASSCODE = 11111111;

class MatterApp {
  cp;
  rpcClient;
  logger;

  constructor() {
    this.rpcClient = new MatterRPCClient();
    this.logger = getLogger("matter");
  }

  start() {
    if (this.isStarted()) {
      this.logger.info("Matter is already started");
      return;
    }
    this.logger.info("Starting Matter");
    this.cp = exec("node /usr/lib/integrations/matter/main.js");
    this.cp.stdout?.on("data", (data) => {
      this.logger.info(data.toString());
    });
    this.cp.on("error", (err) => {
      this.logger.error("Matter Error", err);
    });
    this.cp.on("exit", (code) => {
      this.logger.info("Matter Stoped", code); // [sic] "Stoped"
      this.cp = undefined;
    });
  }

  stop() {
    this.cp?.kill("SIGKILL");
  }

  isStarted() {
    return this.cp != null;
  }

  async enableMatter() {
    this.logger.info("Enable Matter");
    var settings = await YLSubnetSettingsRepository.of().getData();
    settings.intergrations.matter = { // [sic] "intergrations"
      enable: true,
      passcode: settings.intergrations?.matter?.passcode ?? DEFAULT_PASSCODE,
    };
    await YLSubnetSettingsRepository.of().saveData(settings);
    if (!this.isStarted()) this.start();
  }

  async disableMatter() {
    this.logger.info("Disable matter");
    var settings = await YLSubnetSettingsRepository.of().getData();
    settings.intergrations.matter = {
      enable: false,
      passcode: settings.intergrations?.matter?.passcode ?? DEFAULT_PASSCODE,
    };
    await YLSubnetSettingsRepository.of().saveData(settings);
    if (this.isStarted()) this.stop();
  }

  async resetMatter() {
    var wasStarted = this.isStarted();
    if (wasStarted) await this.disableMatter();
    await delayMs(1000);
    fs.rmdirSync("/root/.matter/", { recursive: true });
    this.logger.info("Matter reseted"); // [sic] "reseted"
    if (wasStarted) await this.enableMatter();
  }

  static of() {
    return app.getContext("__rpc_client");
  }

  static register() {
    const instance = new MatterApp();
    app.setContext("__rpc_client", instance);
  }
}

module.exports = { MatterApp };
