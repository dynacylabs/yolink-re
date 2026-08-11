// Original webpack module: 22215 (SqlClient, SqlFactory)
//
// Local SQLite database (path from config.js's getGeneralConfig().localDBPath,
// default /var/lib/yosmart/p1606_local.db) using Node's newer built-in
// `node:sqlite` module (DatabaseSync) rather than a third-party driver.
// Schema migrations are just numbered .sql files under an "assets/tables"
// directory (see getAssets in assets-path.js, module 38965), applied in
// order and tracked in a `db_version` table.

const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
const { getAssets } = require("./assets-path"); // original module 38965
const { getGeneralConfig } = require("./config");

function getAppliedMigrationIndex(db) {
  const hasVersionTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?;").all("db_version").length > 0;
  if (!hasVersionTable) return -1;
  const row = db.prepare("SELECT MAX(idx) as maxIndex FROM db_version").all();
  return row.length === 0 || row[0].maxIndex === null ? -1 : row[0].maxIndex;
}

function applyMigration(db, migration) {
  db.exec(migration.fileContent);
  db.prepare("insert into db_version(idx,file) values (?,?)").run(migration.index, migration.fileName);
  return true;
}

function runPendingMigrations(db) {
  const tablesDir = getAssets("tables");
  const migrations = fs
    .readdirSync(tablesDir)
    .filter((name) => /^[\d]+-[\w]+\.sql$/gi.test(name))
    .map((fileName) => ({
      index: parseInt(fileName.split("-")[0]),
      fileName,
      fileContent: fs.readFileSync(path.join(tablesDir, fileName)).toString(),
    }))
    .sort((a, b) => a.index - b.index);

  const appliedIndex = getAppliedMigrationIndex(db);
  migrations.forEach((migration) => {
    if (migration.index > appliedIndex) {
      const success = applyMigration(db, migration);
      logger.info(`Applied ${migration.fileName} ${success ? "success" : "failed"}`);
    }
  });
}

class SqlClient {
  db;

  constructor() {
    this.db = new DatabaseSync(getGeneralConfig().localDBPath);
    runPendingMigrations(this.db);
  }

  run(sql) {
    this.db.exec(sql);
  }

  getSqlite() {
    return this.db;
  }
}

class SqlFactory {
  static #instance;

  static init() {
    if (!SqlFactory.#instance) SqlFactory.#instance = new SqlClient();
  }

  static get instance() {
    if (!SqlFactory.#instance) throw new Error("SqlClient is not initialized");
    return SqlFactory.#instance;
  }
}

module.exports = { SqlClient, SqlFactory };
