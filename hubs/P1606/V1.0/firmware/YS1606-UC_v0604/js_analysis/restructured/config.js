// Original webpack module: 35051
//
// All runtime configuration is env-var driven (loaded from /root/.env or
// ./.env via `dotenvx`, see loadLocalConfig below), with hardcoded fallback
// defaults baked into the shipped bundle. Those defaults are real working
// credentials/endpoints for a stock hub, not placeholders - see the README
// in this folder for what that means.

const dotenvx = require("@dotenvx/dotenvx"); // original: r(59738)

function loadLocalConfig() {
  dotenvx.config({ debug: true, path: ["/root/.env", ".env"] });
}

// Talks to the embedded ChirpStack ("LoRa Server") instance over gRPC.
// The default token is a real JWT - decoding it shows
// {"aud":"chirpstack","iss":"chirpstack","sub":"<api-key-uuid>","typ":"key"}
// which is the strongest confirmation in the whole bundle that this is an
// actual ChirpStack deployment, not just LoRaWAN-adjacent homegrown code.
function getLoraServerConfig() {
  return {
    grpc: {
      url: process.env["lora.server.grpc.url"] || "localhost:8080",
      token:
        process.env["lora.server.grpc.token"] ||
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjaGlycHN0YWNrIiwiaXNzIjoiY2hpcnBzdGFjayIsInN1YiI6IjNjYjQzZjdiLWUxNTYtNDBkMi1iOWM2LTA1MWQxNWRkMGIzMCIsInR5cCI6ImtleSJ9.4b9YsmWbKy4qvlzxM8xJRuUgLMD16iXH_UMyjmH054U",
    },
  };
}

// Local Redis instance used for device-session/state caching (see
// redis-session-dao.js). db 9 is a mildly unusual default (Redis' default
// is 0) - possibly picked to avoid colliding with something else running
// on the same box.
function getRedisConfig() {
  return {
    host: process.env["redis.host"] || "localhost:6379",
    password: process.env["redis.password"] || "",
    db: parseInt(process.env["redis.db"] || "9"),
  };
}

// gwId/gwSecret are the hub's own cloud-registration identity. If missing,
// hub-provisioning.js's checkEnv() will register the hub with YoLink's
// cloud on first boot and persist these into /etc/environment.
function getGatewayBaseConfig() {
  return {
    gwId: process.env.gwId || "",
    gwSecret: process.env.gwSecret || "",
  };
}

function getGeneralConfig() {
  return {
    apiBaseUrl: process.env["api.smarthome.baseurl"] || "https://us.yosmart.com",
    localDBPath: process.env["db.path"] || "/var/lib/yosmart/p1606_local.db",
    logLevel: process.env["log.level"] || "info",
    logDir: process.env["log.logDir"] || "/tmp/p1606",
    logConsole: process.env["log.stdout"] != null,
  };
}

// The actual LoRa radio (SX126x-family, matches the LLCC68 identification
// elsewhere in this repo) isn't touched directly by this Node process - it
// talks to a separate driver process over a Unix domain socket.
function getLoraDriverConfig() {
  return {
    path: process.env["lora.driver.path"] || "/var/run/lora_radio.sock",
  };
}

module.exports = {
  loadLocalConfig,
  getLoraServerConfig,
  getRedisConfig,
  getGatewayBaseConfig,
  getGeneralConfig,
  getLoraDriverConfig,
};
