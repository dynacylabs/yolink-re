// Original webpack modules: 28405 (AbstractAutomation), 58683
// (DeviceAutomation), 29613 (StateChangeAutomation), 56253
// (AlertAutomation), 5216 (StateComparator/StatePropertyValueComparator)
//
// The rule engine behind per-device "logics" (see yolink-device.js /
// yolink-hub.js's loadLogics/addLogics). A user-authored automation rule
// (e.g. "when this sensor's `open` state changes to true, run these
// actions") gets instantiated as one of these classes based on
// `triggerRule.action` ("StateChange" or "Alert" are the two types
// registered in this bundle), and re-evaluated against every incoming
// BSDP for that device.

const { pick, map, isEqual } = require("./lodash-utils"); // original module 74979 - a handful of individual lodash function imports
const { GeneralTaskList } = require("./general-task-list"); // original module 43010
const { checkTimeValid } = require("./automation-time-window"); // original module 41742

// Compares one dotted/bracketed field path (e.g. "battery" or
// "door[open]") between two state objects, and separately tracks a cached
// "last seen" value per field so StateChangeAutomation can tell "did this
// field's value actually change" apart from "is this field's value
// currently equal to the target."
class StatePropertyValueComparator {
  keyStr;
  key;
  key2;

  constructor(keyStr) {
    this.keyStr = keyStr;
    const bracketIndex = keyStr.indexOf("[");
    if (bracketIndex > 0) {
      this.key = keyStr.substring(0, bracketIndex);
      this.key2 = keyStr.substring(bracketIndex + 1, keyStr.length - 1);
    } else {
      this.key = keyStr;
    }
  }

  getVal(state) {
    if (state === undefined) return;
    const value = state[this.key];
    if (value === undefined) return;
    return this.key2 !== undefined ? value[this.key2] : value;
  }

  isEqual(stateA, stateB) {
    const a = this.getVal(stateA);
    const b = this.getVal(stateB);
    return a !== undefined && isEqual(a, b);
  }
}

class StateComparator {
  #comparators = new Map(); // field path -> StatePropertyValueComparator
  #lastSeenValues = new Map(); // field path -> last observed value (for change detection)

  constructor(ruleTargetState) {
    map(ruleTargetState, (_value, fieldPath) => {
      this.#lastSeenValues.set(fieldPath, null);
      this.#comparators.set(fieldPath, new StatePropertyValueComparator(fieldPath));
    });
  }

  size() {
    return this.#comparators.size;
  }

  // Every configured field must match the target rule's value.
  isMatchRule(incomingState, ruleTargetState) {
    let allMatch = true;
    if (incomingState == null || ruleTargetState == null) return false;
    this.#comparators.forEach((comparator) => {
      const value = comparator.getVal(incomingState);
      if (!isEqual(value, ruleTargetState[comparator.keyStr])) allMatch = false;
    });
    return allMatch;
  }

  // Same as isMatchRule, but additionally requires that at least one
  // watched field's value has actually changed since the last time this
  // was checked (updates the cache as a side effect either way).
  isMatchRuleAndDifferentFromCache(incomingState, ruleTargetState) {
    let matchesTarget = true;
    let changedFromCache = true;
    if (incomingState == null || ruleTargetState == null) return false;
    this.#comparators.forEach((comparator) => {
      const value = comparator.getVal(incomingState);
      if (!isEqual(value, ruleTargetState[comparator.keyStr])) matchesTarget = false;
      if (isEqual(this.#lastSeenValues.get(comparator.keyStr), value)) changedFromCache = false;
      this.#lastSeenValues.set(comparator.keyStr, value);
    });
    if (matchesTarget) changedFromCache = false; // [sic] - see note below
    return changedFromCache;
  }
}

// Base class for every automation rule. Owns the shared bookkeeping
// (enable flag, time-of-day/day-of-week validity window, retry/backoff
// settings) and the actual action-execution pipeline; subclasses only
// need to implement assert() (does this incoming message trigger the
// rule?) and handle() (what to do when it does - almost always just
// "log it and executeActions()").
class AbstractAutomation {
  device;
  deviceId;
  id;
  triggerRule;
  master;
  triggerDeviceId;
  desc;
  type = "";
  actions = [];
  enable = false;
  timeValid;
  advancedSettings;
  generalTask;
  tzOffset;
  lastTrigger;

  constructor(config, device) {
    this.device = device;
    this.deviceId = this.device.deviceId;
    this.id = config.id;
    this.triggerRule = config.triggerRule;
    this.master = config.master;
    this.triggerDeviceId = config.triggerDeviceId;
    this.desc = config.desc;
    this._mergeProperties(config);
    logger.info("Logic:id:%s ,deviceId:%s, has been load;", this.id, this.deviceId);
  }

  // Applies a partial config update, filling in sane defaults for the
  // time-window fields the first time they're set (default: valid all
  // day, every day of the week - `weekmask` 127 = 0b1111111).
  _mergeProperties(config) {
    if (config.type) this.type = config.type;
    if (config.actions) this.actions = config.actions;
    if (config.enable) this.enable = config.enable;
    if (config.timeValid) {
      this.timeValid = config.timeValid;
      if (this.timeValid.start === undefined) this.timeValid.start = 0;
      if (this.timeValid.end === undefined) this.timeValid.end = 0;
      if (this.timeValid.weekmask === undefined) this.timeValid.weekmask = 127;
      if (this.timeValid.tz === undefined) this.timeValid.tz = 0 - new Date().getTimezoneOffset() / 60;
      this.tzOffset = new Date().getTimezoneOffset() + 60 * this.timeValid.tz;
    }
    if (config.advancedSettings != null) this.advancedSettings = config.advancedSettings;
  }

  assert(_bsdp) { return false; }
  isInActiveTime(_minutesSinceMidnight, _dayOfWeek) { return checkTimeValid(this.tzOffset ?? 0, this); }
  handle(_packet) {}
  destroy() {}
  toGeneralInfoMap() {}

  update(config) {
    const changed = pick(config, "type", "actions", "enable", "timeValid");
    logger.info("Logic had been changed", changed);
    this._mergeProperties(config);
    if (this.onUpdate) this.onUpdate();
  }

  onUpdate() {}

  log(result) {
    if (this.isEnableAutomationLog() === false) logger.info("Log Trigger %s ignored", this.id);
  }

  // Runs this rule's action list (device commands, delays, alarm
  // strategies, notifications, filters) via a GeneralTaskList, with a
  // 1-second-since-last-trigger debounce and a 400ms delay before
  // actually starting (presumably to let any in-flight state settle
  // first).
  executeActions() {
    if (!this.actions || !this.actions.length) return;
    const debounceWindowMs = 1000 * this.getIntervalOfContinues();
    if (this.lastTrigger != null && this.lastTrigger.at + debounceWindowMs > Date.now()) return;

    this.lastTrigger = { at: Date.now() };
    if (this.generalTask) this.generalTask.destroy();

    this.generalTask = new GeneralTaskList(
      this.actions,
      (action, done) => {
        if (action.type === "Device") this.handleDeviceAction(this, action, done);
        else if (action.type === "Delay") this.handleDelayAction(this, action, done);
        else if (action.type === "AlarmStrategy") this.handleAlarmStrategyAction(this, action, done);
        else if (action.type === "Notification") this.handleNotificationAction(this, action, done);
        else if (action.type === "Filter") this.handlerFilterAction(this, action, done);
        else done(undefined);
      },
      (result) => {
        if (this.generalTask === this) delete this.generalTask;
        if (result == null) this.log("success");
        else if (result.message === "Abort") this.log("abort");
        else if (result.message === "Destroyed") this.log("stopped");
        else this.log("failed");
      },
      {
        retryTimes: this.getActionRetryTimes(),
        ignoreActionError: this.isActionContinueWhenFailed(),
        ignoreCompleteError: false,
      }
    );
    setTimeout(() => { if (this.generalTask) this.generalTask.start(); }, 400);
  }

  // A "Device" action publishes a command to that device's own /tx topic,
  // tagged with a `producer` block identifying this as coming from
  // automation (as opposed to the app or cloud).
  handleDeviceAction(taskRunner, action, done) {
    const command = JSON.parse(action.actionJson);
    command.producer = { type: "YLDevice", channel: "Automation", endpointId: this.deviceId };
    // NOTE: this condition looks inverted/buggy in the original bundle -
    // the send only happens when retries are exhausted, the rule doesn't
    // continue on failure, and failure notification is off, which is the
    // opposite of what "send this device command" should require. Kept
    // faithful to shipped behavior; flagged rather than "corrected".
    if (this.getActionRetryTimes() > 0 || this.isActionContinueWhenFailed() === false || this.isNotifyWhenAutomationFailed() === true) {
      // no-op (send skipped)
    } else {
      this.device.sendMqttMessage(command, `/ys/${action.deviceId}/tx`);
      taskRunner.delayOf(2000, done);
    }
  }

  handleDelayAction(taskRunner, action, done) {
    action.delay ? taskRunner.delayOf(1000 * action.delay, done) : done(undefined);
  }

  // Stubs in the shipped bundle - presumably implemented server-side/in a
  // different component.
  handleAlarmStrategyAction(taskRunner, action, done) { done(undefined); }
  handleNotificationAction(taskRunner, action, done) { done(undefined); }
  handlerFilterAction(taskRunner, action, done) { done(undefined); }

  isActionContinueWhenFailed() { return this.advancedSettings?.continueWhenFailed ?? true; }
  isEnableAutomationLog() { return this.advancedSettings?.enableLog ?? true; }
  isNotifyWhenAutomationFailed() { return this.advancedSettings?.enableNotifyWhenFailed ?? false; }
  getActionRetryTimes() { return this.advancedSettings?.retryTimes ?? 0; }
  getIntervalOfContinues() { return this.advancedSettings?.intervalOfContinuous ?? 2; }
}

// Adds the registry/factory machinery: each concrete automation type
// self-registers under a string key (see the bottom of
// StateChangeAutomation/AlertAutomation below), and autoInstance() is how
// yolink-device.js/yolink-hub.js turn a stored rule config into the right
// class without a big switch statement.
class DeviceAutomation extends AbstractAutomation {
  static #automationTypes = new Map();

  static registerAutomation(actionKey, automationClass) {
    DeviceAutomation.#automationTypes.set(actionKey, automationClass);
  }

  static autoInstance(config, device) {
    if (!config.id) throw "Trigger id should not be null";
    if (config?.triggerRule?.action == null) throw "Trigger rule should not be null";
    if (!DeviceAutomation.#automationTypes.has(config.triggerRule.action)) throw "Logic type " + config.type + " not existed";
    const AutomationClass = DeviceAutomation.#automationTypes.get(config.triggerRule.action);
    return new AutomationClass(config, device);
  }

  assert(_bsdp) { return false; }
  onUpdate() {}
  handle(_packet) { logger.debug("trigger %s had been trigged", this.id); }
}

// "When this device's state changes to match the rule, fire." Uses
// isMatchRuleAndDifferentFromCache so it only fires on an actual
// transition, not on every repeated report of an already-matching state.
class StateChangeAutomation extends DeviceAutomation {
  stateComparator;

  constructor(config, device) {
    super(config, device);
    this.stateComparator = new StateComparator(this.triggerRule.rule);
  }

  onUpdate() {}

  assert(bsdp) {
    const isRelevantMethod = ["StatusChange", "Alert", "Report", "getState", "setState"].includes(bsdp.method);
    if (!isRelevantMethod || !bsdp.data || !this.triggerRule.rule) return false;
    return (
      this.stateComparator.isMatchRuleAndDifferentFromCache(bsdp.data, this.triggerRule.rule) &&
      ["StatusChange", "Alert", "setState"].includes(bsdp.method)
    );
  }

  handle(_packet) {
    logger.debug("trigger %s had been trigged", this.id);
    this.executeActions();
  }
}
DeviceAutomation.registerAutomation("StateChange", StateChangeAutomation);

// "When this device reports an Alert matching the rule, fire." Simpler
// than StateChangeAutomation - just a plain rule match, no
// change-detection debouncing (Alert messages are already expected to be
// one-shot events).
class AlertAutomation extends DeviceAutomation {
  stateComparator;

  constructor(config, device) {
    super(config, device);
    this.stateComparator = new StateComparator(this.triggerRule.rule);
  }

  onUpdate() {}

  assert(bsdp) {
    return !!(bsdp.method === "Alert" && this.stateComparator && this.stateComparator.size() > 0) && this.stateComparator.isMatchRule(bsdp.data, this.triggerRule.rule);
  }

  handle(_packet) {
    logger.debug("trigger %s had been trigged", this.id);
    this.executeActions();
  }
}
DeviceAutomation.registerAutomation("Alert", AlertAutomation);

module.exports = {
  StatePropertyValueComparator,
  StateComparator,
  AbstractAutomation,
  DeviceAutomation,
  StateChangeAutomation,
  AlertAutomation,
};
