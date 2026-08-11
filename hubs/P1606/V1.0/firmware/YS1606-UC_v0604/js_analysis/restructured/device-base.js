// Original webpack module: 70868
//
// Base class for YoLinkDevice and YoLinkHub (and, transitively, every
// concrete device-type handler used through them). Device IDs starting
// with "1" are hubs - `isHub()` is a cheap prefix check, cached after
// first use.

class Device {
  deviceId;
  dispatcher;
  hub;
  #isHubCache;

  constructor(deviceId, dispatcher) {
    this.deviceId = deviceId;
    this.dispatcher = dispatcher;
    this.onInit();
  }

  onInit() {}

  isHub() {
    if (this.#isHubCache === undefined) this.#isHubCache = this.deviceId.charAt(0) === "1";
    return this.#isHubCache;
  }

  sendMqttMessage(payload, channel, clientId) {}
  async handleAppCommand(command, ctx) {}
  onReceiveMessage(rawPayload, event) {}
  onDestroy() { return false; }

  destroy(callback) {
    this.onDestroy();
    if (callback) callback(true);
  }

  // The first 18 bytes of a raw LoRa command are the fixed YoLink
  // envelope (addressing/sequence/etc, not modeled in this analysis
  // pass) - actual command-specific fields start after that, optionally
  // offset further for commands with their own sub-header.
  getRFCommandStartIndex(extraOffset) {
    return 18 + (extraOffset || 0);
  }
}

module.exports = { Device };
