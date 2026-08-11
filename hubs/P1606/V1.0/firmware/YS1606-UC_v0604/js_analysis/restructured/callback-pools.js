// Original webpack module: 33676 (Callback, CallbackPools)
//
// A small keyed, timeout-expiring callback registry. Used everywhere a
// command is sent out (to a device, to the app, over RPC) and the code
// needs to remember "what to do when/if a matching reply comes back",
// without blocking. See its use in yolink-device.js/yolink-hub.js
// (this.forwardCalls).

const DEFAULT_CONFIG = { timeout: 10000, maxsize: -1, checkInterval: 100 };

class Callback {
  key;
  context;
  #callback;
  time;
  timeout;
  expriseTime; // [sic] "expriseTime" - typo in original, kept for grep-ability
  delayToForwardChannel;
  delayToForwardKey;

  constructor(key, context, callback, options) {
    if (!key || !callback) throw new Error("Callback's key&callback can't be null");
    this.key = key;
    this.context = context;
    this.#callback = callback;
    this.time = Date.now();
    this.timeout = DEFAULT_CONFIG.timeout;
    if (options != null) {
      if (options.time !== undefined) this.time = options.time;
      if (options.timeout !== undefined) this.timeout = options.timeout;
    }
    // "dch" ("delay channel"?) on the triggering context means this
    // callback should also be re-triggerable later via a device/hub-keyed
    // "delay forward" - see CallbackPools.buildDelayForward.
    if (this.context && this.context.payload && this.context.payload.dch) {
      this.delayToForwardChannel = this.context.payload.dch;
      this.delayToForwardKey = (this.context.deviceId || this.context.hubId) + this.delayToForwardChannel;
    }
    this.timeout = DEFAULT_CONFIG.timeout;
    this.expriseTime = this.time + this.timeout;
  }

  isTimeout(now) {
    return (now || Date.now()) > this.expriseTime;
  }

  doCallback(...args) {
    this.#callback.apply(this, args);
  }
}

class CallbackPools {
  config;
  callbacks = {};
  delayForwards = {};
  #checkCount = 0;

  constructor(config, extra) {
    this.config = Object.assign({}, DEFAULT_CONFIG, config);
    Object.assign(this, extra);
  }

  addCallback(key, context, callback, options) {
    if (this.callbacks[key]) delete this.callbacks[key];
    options = options || {};
    if (options.timeout == null) options.timeout = this.config.time;
    this.callbacks[key] = new Callback(key, context, callback, options);

    // Amortized cleanup: only sweep for timed-out entries every
    // `checkInterval` additions, not on every single call.
    this.#checkCount++;
    if (this.#checkCount > this.config.checkInterval) {
      this.#checkCount = 0;
      process.nextTick(() => this.checkTimeout());
    }
  }

  doCallback(key, reply, ctx) {
    if (ctx) {
      const delayKey = (ctx.deviceId || ctx.hubId) + reply.cmd;
      if (this.delayForwards[delayKey]) {
        this.delayForwards[delayKey].doCallback(reply, ctx);
        delete this.delayForwards[delayKey];
      }
    }
    if (this.callbacks[key]) {
      this.callbacks[key].doCallback(reply, ctx);
      this.#buildDelayForward(this.callbacks[key]);
      delete this.callbacks[key];
      return true;
    }
    return false;
  }

  doCallbackIngore(key) { // [sic] "Ingore" - typo in original, matches errors.js's own "Ingore" message
    if (this.callbacks[key]) {
      this.#buildDelayForward(this.callbacks[key]);
      delete this.callbacks[key];
      return true;
    }
    return false;
  }

  checkTimeout() {
    for (const key in this.callbacks) if (this.callbacks[key].isTimeout()) delete this.callbacks[key];
    for (const key in this.delayForwards) if (this.delayForwards[key].isTimeout()) delete this.delayForwards[key];
  }

  #buildDelayForward(callback) {
    if (callback.delayToForwardKey) this.delayForwards[callback.delayToForwardKey] = callback;
  }
}

module.exports = { Callback, CallbackPools };
