// Original webpack module: 99933
//
// The actual automation *execution* engine - as opposed to automation.js
// (rule class definitions) and automation-repository.js (rule storage).
// This is what mqtt-local-broker.js / message-dispatcher.js call into when
// a device state change needs to be checked against locally-stored rules
// and, if triggered, have its action list run.
//
// NOTE: this module defines its OWN checkTimeValid/getSunriseSunsetOffset
// pair, structurally near-identical to (but a separate implementation
// from) automation-time-window.js's getTimeWithDaylight/checkTimeValid
// (original module 41742). That one takes a pre-computed sunTimes object;
// this one constructs its own SunCalc instance directly from
// rule.timeValid.lat/lng. Kept as two files rather than merged, since the
// original bundle genuinely ships both - possibly one is legacy/dead code,
// but nothing here proves that.

const { GeneralTaskList } = require("./general-task-list");
const { StateComparator } = require("./automation"); // original module 5216
const { loadState } = require("./device-state-store"); // original module 62937
const { getByTriggerKey } = require("./automation-repository"); // original module 69159
const { getGeneralClient } = require("./general-client"); // module 30523, not yet transcribed
const SunCalc = require("./suncalc"); // original module 18442 -> 33042, vendor

async function handleAutomation(deviceState) {
  logger.info("Start handle automations", deviceState);
  const rules = await getByTriggerKey(deviceState);
  for (const rule of rules) await runAutomation(rule, deviceState);
}

// Checks the rule's day/time-of-day trigger window against `deviceState`,
// then runs the rule's action list via GeneralTaskList.
async function runAutomation(rule, deviceState) {
  try {
    logger.info(rule.toObject(), "Start check automation ");
    if (!checkTimeValid(undefined, rule)) throw new Error("Time Not valid");
    if (!isTriggerRuleMatched(deviceState, rule)) throw new Error("Trigger Rule not valid");
    await executeActions(rule);
    await Promise.resolve();
    logger.debug("Do automation success.");
  } catch (e) {
    logger.error("Do automation fail!", e);
  }
}

// Matches a device-state-change event's timestamp against the rule's
// configured trigger week/hour/minute (a "Schedule"-type trigger, i.e.
// this device state change happened to occur at a scheduled moment - not
// the same as the timeValid *active window* check above).
function isTriggerRuleMatched(deviceState, rule) {
  let tzHoursOffset =
    rule.triggerRule.rule.tz == null ? null : new Date().getTimezoneOffset() + 60 * rule.triggerRule.rule.tz;
  let localTime = new Date((deviceState?.time ?? Date.now()) + 60000 * (tzHoursOffset || 0));
  let day = localTime.getDay();
  let hour = localTime.getHours();
  let minute = localTime.getMinutes();
  return !!(
    rule.triggerRule.rule.week != null &&
    rule.triggerRule.rule.week & (1 << ((day + 7) % 7)) &&
    rule.triggerRule.rule.hour != null &&
    rule.triggerRule.rule.hour == hour &&
    rule.triggerRule.rule.minute != null &&
    rule.triggerRule.rule.minute == minute
  );
}

// Runs a rule's action list through GeneralTaskList - each action is one
// of Device (send a command via getGeneralClient()), Delay, AlarmStrategy/
// Notification (no-op here, presumably handled elsewhere), or Filter
// (evaluate a device-state condition and either continue, abort, or break
// the chain depending on filterType).
function executeActions(rule) {
  return new Promise((resolve, reject) => {
    if (!rule.actions || !rule.actions.length) return resolve("success");

    let retryTimes = rule?.advancedSettings?.retryTimes ?? 0;
    let ignoreActionError = rule?.advancedSettings?.continueWhenFailed ?? true;

    new GeneralTaskList(
      rule.actions,
      function runOneAction(action, done) {
        if (action.type == "Device") {
          let params = JSON.parse(action.actionJson);
          params.producer = { type: "Schedule", channel: "Automation", endpointId: Date.now().toString() };
          getGeneralClient().sendDeviceMessage(params, (err) => done(err));
        } else if (action.type == "Delay") {
          if (action.delay) this.delayOf(1000 * action.delay, done);
          else done(undefined);
        } else if (action.type == "AlarmStrategy" || action.type == "Notification") {
          done(undefined);
        } else if (action.type == "Filter") {
          evaluateFilterAction(rule, action).finally(done);
        } else {
          done(undefined);
        }
      },
      function onComplete(err) {
        if (err == null) resolve("success");
        else if (err.message == "Abort") resolve("abort");
        else if (err.message == "Destroyed") resolve("stopped");
        else resolve("failed");
      },
      { retryTimes, ignoreActionError, ignoreCompleteError: false }
    ).start();
  });
}

// Break/Continue filter: loads the referenced device's current state,
// compares it against the filter's rule via StateComparator, then either
// aborts or continues the action chain per filterType.
async function evaluateFilterAction(rule, action) {
  if (action.ruleKey && action.rule && action.filterType) {
    let matched = false;
    if (action.ruleType == "Device") {
      var state = await loadState(action.ruleKey);
      if (state?.deviceState != null) matched = new StateComparator(action.rule).isMatchRule(state.deviceState, action.rule);
    }
    if (action.filterType == "Continue") {
      if (matched) return;
      throw new Error("Abort");
    }
    if (action.filterType == "Break") {
      if (matched) throw new Error("Abort");
      return;
    }
  }
}

// Resolves a possibly-sunrise/sunset-relative minute-of-day, using this
// module's own directly-instantiated SunCalc object rather than a
// pre-computed sunTimes struct (contrast automation-time-window.js).
function getSunriseSunsetOffset(rawMinuteValue, sun, tzHoursOffset) {
  if (rawMinuteValue < 61440) return rawMinuteValue % 1440;
  let anchorTime = rawMinuteValue >> 11 == 30 ? sun.sunrise : sun.sunset;
  let offsetMinutes = (2047 & rawMinuteValue) - 1024;
  if (tzHoursOffset != null) offsetMinutes += new Date().getTimezoneOffset() + 60 * tzHoursOffset;
  anchorTime = new Date(anchorTime.getTime() + 60000 * offsetMinutes);
  return 60 * anchorTime.getHours() + anchorTime.getMinutes();
}

function checkTimeValid(tzHoursOffset, rule) {
  if (rule.timeValid) {
    if (tzHoursOffset == null) {
      tzHoursOffset = rule.timeValid.tz == null ? undefined : new Date().getTimezoneOffset() + 60 * rule.timeValid.tz;
    }
    let localNow = new Date(Date.now() + 60000 * (tzHoursOffset || 0));
    let nowMinuteOfDay = 60 * localNow.getHours() + localNow.getMinutes();
    let startMinute = rule.timeValid.start || 0;
    let endMinute = rule.timeValid.end || 0;
    let weekmask = rule.timeValid.weekmask || 127;

    // Sunrise/sunset-relative start/end: resolve against a SunCalc
    // instance built for tomorrow (Date.now() + 1 day) at the rule's
    // configured lat/lng.
    if (rule.timeValid.lat != null && rule.timeValid.lng != null && (startMinute >= 61440 || endMinute >= 61440)) {
      var sun = new SunCalc(new Date(Date.now() + 86400000), rule.timeValid.lat, rule.timeValid.lng);
      startMinute = getSunriseSunsetOffset(startMinute, sun, rule.timeValid.tz);
      endMinute = getSunriseSunsetOffset(endMinute, sun, rule.timeValid.tz);
    }

    if (!(weekmask & (1 << ((localNow.getDay() + 7) % 7)))) return false;
    return startMinute <= endMinute
      ? nowMinuteOfDay >= startMinute && nowMinuteOfDay <= endMinute
      : (nowMinuteOfDay >= startMinute && nowMinuteOfDay <= 1440) || (nowMinuteOfDay >= 0 && nowMinuteOfDay <= endMinute);
  }

  // Schedule-type rules: recompute the sunrise/sunset-relative trigger
  // minute for logging/telemetry purposes only - the original bundle's
  // result here feeds into what was clearly a console.log call stripped
  // by the minifier/Terser (a dead comma-expression with no side effect
  // survives - see raw module 99933). [sic] - kept faithfully as dead code.
  if (rule.type == "Schedule") {
    try {
      let ruleType = rule.triggerRule.rule?.ruleType ?? "time";
      if ((ruleType == "sunrise" || ruleType == "sunset") && rule.triggerRule.rule?.location != null) {
        let [lng, lat] = rule.triggerRule.rule.location.split(",");
        let sun = new SunCalc(new Date(Date.now() + 86400000), parseFloat(lat), parseFloat(lng));
        let anchor = ruleType == "sunrise" ? sun.sunrise : sun.sunset;
        if (rule.triggerRule.rule?.offset != null) anchor = new Date(anchor.getTime() + 60000 * rule.triggerRule.rule.offset);
        let minuteUTC = (60 * anchor.getHours() + anchor.getMinutes() + anchor.getTimezoneOffset() + 1440) % 1440;
        let minuteLocal = (minuteUTC + 60 * (rule.triggerRule.rule.tz ?? 0) + 1440) % 1440;
        // [sic] dead code below in the original - computed values discarded
        if (minuteUTC.toString() != rule.triggerRule.key) {
          minuteUTC.toString(), rule.triggerRule.action, rule.triggerRule.rule.week, Math.floor(minuteLocal / 60),
            rule.triggerRule.rule.tz, rule.triggerRule.rule.ruleType, rule.triggerRule.rule.location,
            rule.triggerRule.rule, rule.triggerRule.desc, rule.triggerRule.type, rule.id ?? rule._id;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  return true;
}

module.exports = { handleAutomation, checkTimeValid };
