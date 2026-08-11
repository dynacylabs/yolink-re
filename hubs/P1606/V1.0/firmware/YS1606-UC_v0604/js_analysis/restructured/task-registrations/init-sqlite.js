// Original webpack module: 63738
//
// CORRECTION: an earlier pass mislabeled this file's content as module
// 75090. Having since traced the real call graph, module 75090 is
// actually a thin combinator that calls this function (63738) AND
// start-schedule.js's registerScheduleStart (module 28662) together -
// see init-sqlite-and-schedule.js. This file's content itself was always
// correct; only its module-ID attribution was wrong.
const { YLTask } = require("../app-lifecycle");
const { SqlFactory } = require("../sqlite-storage");

module.exports.default = function registerSqliteInit(lifecycle) {
  lifecycle.addTask(
    "onInit",
    new YLTask("Init SQLite Database", async () => {
      SqlFactory.init();
    }),
    1
  );
};
