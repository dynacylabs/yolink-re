// Original webpack module: 83087
//
// Sets up four named winston loggers (main / matter / gateway / subnet),
// each writing JSON-formatted logs to its own file under logDir (default
// /tmp/p1606, see config.js) plus optionally the console. Log level and
// destination are both env-var configurable; nothing here is
// device-identifying on its own.

const winston = require("winston"); // original: r(51440)
const { getGeneralConfig } = require("./config");

const container = new winston.Container();

function buildTransports(logName) {
  const { logDir, logConsole } = getGeneralConfig();
  const transports = [new winston.transports.File({ dirname: logDir, filename: `${logName}.log` })];
  if (logConsole) transports.push(new winston.transports.Console());
  return transports;
}

function createLoggers() {
  const { logLevel } = getGeneralConfig();
  const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());

  container.add("main", { level: logLevel, format: jsonFormat, transports: buildTransports("main") });
  container.add("matter", {
    level: logLevel,
    format: jsonFormat,
    defaultMeta: { module: "MatterApp" },
    transports: buildTransports("integration-matter"),
  });
  container.add("gateway", { level: logLevel, format: jsonFormat, transports: buildTransports("gateway") });
  container.add("subnet", { level: logLevel, format: jsonFormat, transports: buildTransports("subnet") });

  return {
    logger: container.get("main"),
    matterLogger: container.get("matter"),
    gatewayLogger: container.get("gateway"),
    subnetLogger: container.get("subnet"),
  };
}

function getLogger(name) {
  return container.get(name || "main");
}

module.exports = { createLoggers, getLogger };
