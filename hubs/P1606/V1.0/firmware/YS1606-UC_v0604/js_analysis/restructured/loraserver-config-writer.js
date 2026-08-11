// Original webpack module: 39054
//
// Writes /etc/loraserver/<net_id>/loraserver.toml (+ a region config
// file) from bundled template assets whenever the currently-active config
// (symlinked at /etc/loraserver/current) doesn't match this hub's own
// LoRa network id - i.e. this is how the same firmware build supports
// hubs provisioned onto different LoRa networks without needing a
// per-build config baked in.

const toml = require("smol-toml"); // original: r(43334) - a TOML parser/serializer
const fs = require("fs");
const { getAssets } = require("./assets-path");

const LORASERVER_ETC_DIR = "/etc/loraserver";
const CURRENT_CONFIG_SYMLINK = `${LORASERVER_ETC_DIR}/current`;

function readAssetTemplate(fileName) {
  return fs.readFileSync(getAssets(fileName)).toString();
}

function writeFile(contents, destPath) {
  return fs.writeFileSync(destPath, contents);
}

function writeConfigForNetId(netId) {
  const configDir = `${LORASERVER_ETC_DIR}/${netId}`;
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  const baseConfig = toml.parse(readAssetTemplate("loraserver.toml"));
  baseConfig.network.net_id = netId.toString();
  baseConfig.sqlite.path = `sqlite://${CURRENT_CONFIG_SYMLINK}/loraserver.sqlite`;
  writeFile("#Autocreated\n" + toml.stringify(baseConfig), `${configDir}/loraserver.toml`);

  const regionFileName = "region_us915lc.toml"; // hardcoded to US915LC - see README on region support
  const regionConfig = toml.parse(readAssetTemplate(regionFileName));
  writeFile("#Autocreated\n" + toml.stringify(regionConfig), `${configDir}/${regionFileName}`);

  fs.symlinkSync(configDir, CURRENT_CONFIG_SYMLINK);
}

function checkServerConfig() {
  const netId = app.getLoraNetId();
  if (netId == null) return;

  const isCurrentConfigValid = () => fs.existsSync(CURRENT_CONFIG_SYMLINK) && fs.readlinkSync(CURRENT_CONFIG_SYMLINK).endsWith(netId);
  if (!isCurrentConfigValid()) {
    logger.info("Make configuration");
    writeConfigForNetId(netId);
  }
}

module.exports = { checkServerConfig };
