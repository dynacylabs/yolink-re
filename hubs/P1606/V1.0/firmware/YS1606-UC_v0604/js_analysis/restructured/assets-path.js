// Original webpack module: 38965
// Locates the app's bundled "assets" directory - tries relative to the
// bundle's own location first, falls back to the known install path
// (/usr/lib/p1606/assets, matching the p1606mq-dev.tar.gz install
// location referenced throughout this repo). Throws at load time if
// neither exists.
const fs = require("fs");
const path = require("path");

let assetsDir = path.join(__dirname, "../../assets");
if (!fs.existsSync(assetsDir)) assetsDir = path.join("/usr/lib/p1606", "assets");
if (!fs.existsSync(assetsDir)) throw new Error("Assets not found");

function getAssets(relativePath) {
  return path.join(assetsDir, relativePath);
}

module.exports = { getAssets };
