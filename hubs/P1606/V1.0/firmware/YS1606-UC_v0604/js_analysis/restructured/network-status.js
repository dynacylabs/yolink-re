// Original webpack module: 69113
// Thin, renamed re-export layer over nmcli-wrapper.js (module 5406) and
// gw-ap-hotspot.js (module 34303) - this is the actual module every
// other file in the bundle imports from for network/wifi operations.

const nmcli = require("./nmcli-wrapper");
const { startHotspot, stopHotspot, statHotspot } = require("./gw-ap-hotspot");

async function isWiFiEnabled() {
  return (await nmcli.getWifiStatus()) == "enabled";
}

async function getNetDevDetails(device) {
  return await nmcli.getDeviceInfoIPDetail(device);
}

async function getNetworkConnectivity() {
  return await nmcli.getNetworkConnectivityState();
}

async function getWifiList(rescan = true) {
  return await nmcli.getWifiList(rescan);
}

async function connectWifi(ssid, password) {
  return await nmcli.wifiConnect(ssid, password).then(() => true);
}

function wifiStartHotspot() {
  return startHotspot();
}

function wifiStopHotspot() {
  return stopHotspot();
}

function wifiStatHotspot() {
  return statHotspot();
}

module.exports = {
  isWiFiEnabled,
  getNetDevDetails,
  getNetworkConnectivity,
  getWifiList,
  connectWifi,
  wifiStartHotspot,
  wifiStopHotspot,
  wifiStatHotspot,
};
