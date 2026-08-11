// Original webpack module: 30264 (InfraredRemoter API handler)
// "learn" gets an extended 15s timeout, matching the IR-blaster's real
// learn-mode latency (compare device-command-tables.md's InfraredRemoter
// LoRa handler, which has the same extended-timeout shape for its own
// "learn" opcode).
const { APIHandler } = require("./api-handler-base");

class InfraredRemoterAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "infraredRemoter";
  }

  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  common(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }

  learn(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req, undefined, { timeout: 15000 }))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }

  getState(req, res) {
    return this.common(req, res);
  }

  setTimeZone(req, res) {
    return this.common(req, res);
  }

  getSchedules(req, res) {
    return this.common(req, res);
  }

  setSchedules(req, res) {
    return this.common(req, res);
  }

  send(req, res) {
    return this.common(req, res);
  }
}

module.exports = { InfraredRemoterAPIHandler };
