// Original webpack module: 62937 - thin delegator to device-state-repository.js
const { YLDeviceStateRepository } = require("./device-state-repository");

async function saveState(deviceId, update, options) {
  return YLDeviceStateRepository.of().saveState(deviceId, update, options);
}
async function loadState(deviceId) {
  return YLDeviceStateRepository.of().get(deviceId);
}

module.exports = { saveState, loadState };
