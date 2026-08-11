// Original webpack module: 43010
//
// Sequential task runner used by automation.js's executeActions() to run
// an automation rule's action list one at a time, with per-action retry
// and an overall "did anything fail" flag that survives even if
// individual failures are configured to be ignored.

class GeneralTaskList {
  dataList;
  delayTimer;
  isDestroyed = false;
  delayCaller;
  #containCaller; // per-item action executor: (item, done) => void
  #completeCaller; // (error|undefined) => void, called once at the end
  option;
  hasFailedExecution = false;

  constructor(dataList, containCaller, completeCaller, options) {
    this.option = {
      retryTimes: options?.retryTimes ?? 0,
      ignoreActionError: options?.ignoreActionError ?? true,
      ignoreCompleteError: options?.ignoreCompleteError ?? true,
    };
    this.dataList = dataList;
    this.#containCaller = containCaller;
    this.#completeCaller = completeCaller;
  }

  // A cancelable one-shot delay - used by automation.js's "Delay" action
  // type. Cancels any previously pending delay first.
  delayOf(ms, callback) {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      delete this.delayTimer;
      delete this.delayCaller;
    }
    this.delayCaller = callback;
    this.delayTimer = setTimeout(() => {
      delete this.delayTimer;
      const pendingCallback = this.delayCaller;
      delete this.delayCaller;
      if (pendingCallback != null) pendingCallback(undefined);
    }, ms);
  }

  start() {
    if (!this.dataList || !this.dataList.length) return this.destroy();
    this.handleAllData()
      .then(() => this.complete())
      .catch((err) => this.complete(err))
      .finally(() => {
        delete this.#completeCaller;
        delete this.dataList;
        delete this.#containCaller;
      });
  }

  async handleAllData() {
    if (this.dataList != null) for (const item of this.dataList) await this.handleData(item);
  }

  handleData(item) {
    if (this.isDestroyed) return Promise.reject(new Error("Destroyed"));
    return new Promise((resolve, reject) => {
      this.#runWithRetry(item, 0, (err) => (err ? reject(err) : resolve()));
    });
  }

  #runWithRetry(item, attempt, done) {
    if (this.#containCaller == null) return done(new Error("Task list had been destroyed"));
    this.#containCaller(item, (err) => {
      if (err == null) return done(err);
      if (err.message === "Abort") return done(err);
      if (attempt < this.option.retryTimes) return this.#runWithRetry(item, attempt + 1, done);
      if (this.option.ignoreActionError === true) {
        this.hasFailedExecution = true;
        return done(undefined);
      }
      done(err);
    });
  }

  complete(err) {
    if (this.#completeCaller) {
      if (err == null && this.hasFailedExecution === true) err = new Error("Failed executions included");
      this.#completeCaller(this.option.ignoreCompleteError ? undefined : err);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      if (this.delayCaller) this.delayCaller(new Error("Destroyed"));
      delete this.delayTimer;
      delete this.delayCaller;
    }
    this.dataList = [];
    delete this.#containCaller;
  }
}

module.exports = { GeneralTaskList };
