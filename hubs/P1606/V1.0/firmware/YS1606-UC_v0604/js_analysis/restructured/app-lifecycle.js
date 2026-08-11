// Original webpack modules: 57110 (YLTask/YLTaskGroup), 29876 (AppLifeCycle)
//
// YoLink's own tiny task-runner framework. Every startup step in the app
// (open the database, start the HTTP/MQTT servers, connect to the LoRa
// radio, provision the ChirpStack subnet, register Matter, ...) registers
// itself as a YLTask under one of three lifecycle phases - "onInit",
// "onPreset", "onReady" - with an optional priority for ordering within a
// phase. AppLifeCycle assembles all of them into one big nested
// YLTaskGroup and runs it top to bottom at boot.

class YLTask {
  #run;
  description;
  #errorHandler;
  #state = "none"; // "none" | "running" | "success"
  #result;

  constructor(description, run) {
    this.description = description;
    this.#run = run;
  }

  start() {
    if (this.#state === "running" || this.#state === "success") {
      return Promise.resolve(this.#result);
    }
    return this.#run()
      .then((result) => {
        this.#state = "success";
        this.#result = result;
        return result;
      })
      .catch((err) => {
        if (this.#errorHandler != null) return this.#errorHandler(err);
        throw err;
      });
  }

  // Used for lifecycle event handlers (see buildOnEventHander below), where
  // one misbehaving listener shouldn't take the whole boot sequence down.
  ignoreError() {
    this.#errorHandler = () => Promise.resolve();
    return this;
  }
}

class YLTaskGroup extends YLTask {
  tasks;

  constructor(description, tasks) {
    super(description, () => this.runAllTasks());
    this.tasks = tasks ?? [];
  }

  addTask(task) {
    this.tasks.push(task);
  }

  async runAllTasks() {
    for (const task of this.tasks) await task.start();
  }
}

class AppLifeCycle {
  static #sharedInstance;

  #events = new Map(); // phase name -> Array<() => Promise<void>>
  #tasks = new Map(); // phase name -> Array<{priority, handler: YLTask}>
  #mainTask;

  // Builds (once, lazily) the full nested task tree:
  //   App LifeCycle
  //     App Initializing   ("onInit" tasks, then "onInit" event listeners)
  //     App Presetting Data ("onPreset" ...)
  //     App Starting        ("onReady" ...)
  buildTask() {
    if (this.#mainTask == null) {
      this.#mainTask = new YLTaskGroup("App LifeCycle", [
        new YLTaskGroup("App Initializing", [
          this.#buildPhaseTaskGroup("onInit"),
          this.#buildPhaseEventHandler("onInit"),
        ]),
        new YLTaskGroup("App Presetting Data", [
          this.#buildPhaseTaskGroup("onPreset"),
          this.#buildPhaseEventHandler("onPreset"),
        ]),
        new YLTaskGroup("App Staring", [
          this.#buildPhaseTaskGroup("onReady"),
          this.#buildPhaseEventHandler("onReady"),
        ]),
      ]);
    }
    return this.#mainTask;
  }

  // Registered by modules that need "run some code at phase X" (e.g. an
  // HTTP server that must be listening before other tasks assume it is).
  addEvent(phase, handler) {
    let list = this.#events.get(phase);
    if (list == null) {
      list = [];
      this.#events.set(phase, list);
    }
    list.push(handler);
  }

  // Registered by modules that need "run this named, orderable startup
  // step" (the vast majority of the onInit/onReady wiring in this bundle).
  addTask(phase, task, priority) {
    let list = this.#tasks.get(phase);
    if (list == null) {
      list = [];
      this.#tasks.set(phase, list);
    }
    list.push({ priority, handler: task });
  }

  #buildPhaseTaskGroup(phase) {
    const list = this.#tasks.get(phase);
    if (list != null) {
      list.sort((a, b) => a.priority - b.priority);
      return new YLTaskGroup(
        `[${phase}] Tasks`,
        list.map((entry) => entry.handler)
      );
    }
    return new YLTask(`[${phase}]Empty Tasks`, async () => {});
  }

  #buildPhaseEventHandler(phase) {
    const list = this.#events.get(phase);
    if (list != null) {
      return new YLTask(`[${phase}] Tasks`, async () => {
        for (const handler of list) await handler();
      }).ignoreError();
    }
    return new YLTask(`[${phase}]Empty Events`, async () => {});
  }

  static shared() {
    if (this.#sharedInstance == null) this.#sharedInstance = new AppLifeCycle();
    return this.#sharedInstance;
  }
}

module.exports = { YLTask, YLTaskGroup, AppLifeCycle };
