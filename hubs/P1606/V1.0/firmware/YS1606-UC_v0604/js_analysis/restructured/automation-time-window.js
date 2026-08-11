// Original webpack module: 41742
//
// Time-of-day/day-of-week validity checking for automation rules (see
// automation.js's AbstractAutomation.isInActiveTime). Also handles
// "sunrise/sunset-relative" scheduling - a start/end minute value >=
// 61440 is a sentinel meaning "relative to sunrise or sunset" rather than
// a literal minute-of-day.

// Resolves a possibly-sunrise/sunset-relative minute value into an actual
// minute-of-day. Values below 61440 are literal minutes-since-midnight.
// Values at/above that are decoded as: bit 11 set = sunset anchor (else
// sunrise), low 11 bits (minus 1024) = signed offset in minutes from that
// anchor, optionally further adjusted for timezone.
function getTimeWithDaylight(rawMinuteValue, sunTimes, tzHoursOffset) {
  if (rawMinuteValue < 61440) return rawMinuteValue % 1440;

  const anchorTime = rawMinuteValue >> 11 === 30 ? sunTimes.sunrise : sunTimes.sunset;
  let offsetMinutes = (2047 & rawMinuteValue) - 1024;
  if (tzHoursOffset != null) offsetMinutes += new Date().getTimezoneOffset() + 60 * tzHoursOffset;

  const resolvedTime = new Date(anchorTime.getTime() + 60000 * offsetMinutes);
  return 60 * resolvedTime.getHours() + resolvedTime.getMinutes();
}

// Checks "is right now within this automation rule's configured active
// window" - both the day-of-week bitmask (weekmask, bit N = day N is
// Sunday=0..Saturday=6, ISO-adjusted via `(day+7)%7`) and the start/end
// minute-of-day range, which can wrap past midnight (start > end means
// "overnight window").
function checkTimeValid(tzHoursOffset, rule) {
  if (!rule.timeValid) return true;

  if (tzHoursOffset == null) {
    tzHoursOffset = rule.timeValid.tz == null ? null : new Date().getTimezoneOffset() + 60 * rule.timeValid.tz;
  }

  const localNow = new Date(Date.now() + 60000 * (tzHoursOffset || 0));
  const nowMinuteOfDay = 60 * localNow.getHours() + localNow.getMinutes();
  const startMinute = rule.timeValid.start || 0;
  const endMinute = rule.timeValid.end || 0;

  const isTodayEnabled = !!((rule.timeValid.weekmask || 127) & (1 << ((localNow.getDay() + 7) % 7)));
  if (!isTodayEnabled) return false;

  if (startMinute <= endMinute) {
    return nowMinuteOfDay >= startMinute && nowMinuteOfDay <= endMinute;
  }
  // Overnight window (e.g. 22:00-06:00): valid if after start-till-midnight
  // OR before midnight-till-end.
  return (nowMinuteOfDay >= startMinute && nowMinuteOfDay <= 1440) || (nowMinuteOfDay >= 0 && nowMinuteOfDay <= endMinute);
}

module.exports = { getTimeWithDaylight, checkTimeValid };
