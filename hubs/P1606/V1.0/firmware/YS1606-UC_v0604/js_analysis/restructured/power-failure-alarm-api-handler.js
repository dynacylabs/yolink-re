// Original webpack module: 31383 (PowerFailureAlarm API handler)
// nsDeviceType is "PFSensor" - matches device-command-tables.md's
// PowerFailureDetector LoRa handler's registered type key.
const { APIHandler } = require("./api-handler-base");

class PowerFailureAlarmAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "PFSensor";
  }

  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }
}

module.exports = { PowerFailureAlarmAPIHandler };
