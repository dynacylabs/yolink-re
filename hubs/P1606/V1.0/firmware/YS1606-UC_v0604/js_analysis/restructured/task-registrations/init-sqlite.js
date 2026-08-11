// Original webpack module: 75090
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
