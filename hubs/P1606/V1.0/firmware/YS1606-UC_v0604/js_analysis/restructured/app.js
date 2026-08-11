// Original webpack modules: 31891 (app singleton), 80979 (AppContext),
// 15381 (setupBase), 65559 (loadAllAppTasks), plus the bundle's own
// entry-point IIFE at the very end of index.js.
//
// This is the actual top of the whole application. `global.app` is set
// once, here, and every other module in the bundle reaches it as a bare
// global rather than importing it explicitly.

const { di } = require("./di-container"); // original: r(70875)
const { AppLifeCycle } = require("./app-lifecycle");

// Thin wrapper around a small dependency-injection registry (di.get/
// di.register). "subnet" and "gateway" are the two singleton objects
// every device/message-handling module ultimately needs a handle to.
class AppContext {
  getContext(key) {
    return di.get(key, /* throwIfMissing */ false);
  }

  setContext(key, value) {
    return di.register(key, value);
  }

  getSubnet() {
    return di.get("subnet", false);
  }

  getGateway() {
    return di.get("gateway", true); // throws if not yet registered
  }

  registerSubnet(subnet) {
    di.register("subnet", subnet);
  }

  registerGateway(gateway) {
    di.register("gateway", gateway);
  }

  getSubnetId() {
    return this.getSubnet()?.getSubnetId();
  }

  getLoraNetId() {
    return this.getSubnet()?.getLoraNetId();
  }
}

const app = new (class {
  version;
  context;
  lifecycle;

  constructor() {
    // Matches the firmware build tag documented elsewhere in this repo
    // (hubs/P1606/V1.0/firmware/YS1606-UC_v0604) - the version string is
    // literally baked into the JS bundle at build time.
    this.version = "0604";
    this.context = new AppContext();
    this.lifecycle = AppLifeCycle.shared();
  }

  getContext(key) {
    return this.context.getContext(key);
  }
  setContext(key, value) {
    this.context.setContext(key, value);
  }
  getSubnet() {
    return this.context.getSubnet();
  }
  getGateway() {
    return this.context.getGateway();
  }
  getSubnetId() {
    return this.context.getSubnetId();
  }
  getLoraNetId() {
    return this.context.getLoraNetId();
  }

  addTask(phase, task, priority) {
    this.lifecycle.addTask(phase, task, priority);
  }
  addEvent(phase, handler) {
    this.lifecycle.addEvent(phase, handler);
  }
});

// ---- setupBase (original module 15381) ----
// Called once, before anything else: loads .env, wires up the global
// logger, and stamps a per-process instance id (used to namespace Redis
// keys / general RPC clients so multiple hub processes don't collide).
function setupBase() {
  const { loadLocalConfig } = require("./config");
  const { createLoggers } = require("./logger");
  const os = require("os");

  loadLocalConfig();
  const { logger } = createLoggers();
  global.logger = logger;
  global.INSTANCEID = os.hostname();
}

// ---- loadAllAppTasks (original module 65559) ----
// Registers every "onInit"/"onReady"/"onPreset" task from across the
// bundle onto one AppLifeCycle, then builds the final nested YLTaskGroup
// tree. Call order and module IDs below are verified directly against
// the original bundle's requires for this function, not guessed.
//
// CORRECTION: an earlier pass through this file guessed that a 7th
// registration here was "start-p1605-bridge" (module 95428), based on
// context (yolink-hub.js's P1605-bridge regex) rather than the module's
// actual content. Having since examined module 95428 directly, it's
// task-registrations/load-remote-data.js - syncing gateway config/subnet
// info/subnet devices on "onPreset" - nothing about P1605 bridging.
// There's no dedicated "P1605 bridge task registration" module; the
// bridging behavior lives entirely in yolink-hub.js's own logic. Also
// corrected: module 75090 isn't the SQLite-init task itself (that's
// module 63738 - see init-sqlite.js) - it's a combinator that calls both
// init-sqlite.js's and start-schedule.js's registrations together (see
// init-sqlite-and-schedule.js).
function loadAllAppTasks(lifecycle = AppLifeCycle.shared()) {
  const registerHttpMqttServers = require("./task-registrations/start-http-mqtt").default; // module 23969
  const registerSqliteAndSchedule = require("./task-registrations/init-sqlite-and-schedule").default; // module 75090
  const registerLoadRemoteData = require("./task-registrations/load-remote-data").default; // module 95428
  const registerLocalGateway = require("./task-registrations/start-local-gateway").default; // module 11292
  const registerLoraServerSubnet = require("./task-registrations/start-loraserver-subnet").default; // module 18784
  const registerLoraModuleConnect = require("./task-registrations/connect-lora-module").default; // module 45844 -> 39377
  const registerMatterRpc = require("./task-registrations/start-matter").default; // module 3706

  registerHttpMqttServers(lifecycle);
  registerSqliteAndSchedule(lifecycle);
  registerLoadRemoteData(lifecycle);
  registerLocalGateway(lifecycle);
  registerLoraServerSubnet(lifecycle);
  registerLoraModuleConnect(lifecycle);
  registerMatterRpc(lifecycle);

  return lifecycle.buildTask();
}

// ---- the bundle's actual entry point ----
// (original: the final IIFE in index.js, after __webpack_modules__)
async function main() {
  const { startLoop } = require("./status-loop"); // module 68213

  global.app = app;
  setupBase();

  if (process.argv.includes("--version")) {
    console.log(app.version);
  } else if (process.argv.includes("--loop")) {
    startLoop();
  } else {
    await retryForever(() => loadAllAppTasks(app.lifecycle).start());
    logger.info("App started successfully!");
  }
}

async function retryForever(fn, retryDelayMs = 1000) {
  for (;;) {
    try {
      await fn();
      break;
    } catch (err) {
      logger.error("App start failed, retry in 1s", err);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

module.exports = { app, AppContext, setupBase, loadAllAppTasks, main };
