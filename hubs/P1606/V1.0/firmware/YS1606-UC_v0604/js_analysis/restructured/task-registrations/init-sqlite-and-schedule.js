// Original webpack module: 75090
// A thin combinator - just calls the SQLite-init registration (module
// 63738, see init-sqlite.js) and the schedule-start registration (module
// 28662, see start-schedule.js) back to back. Why the original bundle
// groups these two unrelated registrations into one module rather than
// listing both directly in loadAllAppTasks isn't clear - possibly a
// webpack code-splitting artifact rather than an intentional grouping.
const registerSqliteInit = require("./init-sqlite").default;
const registerScheduleStart = require("./start-schedule").default;

module.exports.default = function registerSqliteAndSchedule(lifecycle) {
  registerSqliteInit(lifecycle);
  registerScheduleStart(lifecycle);
};
