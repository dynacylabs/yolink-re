// Original webpack module: 65205 (LeakSensor API handler)
const { APIHandler } = require("./api-handler-base");

class LeakSensorAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "leakSensor";
  }

  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  common(req, res, extraFields) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req, extraFields))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }

  setSettings(req, res) {
    return this.common(req, res, { method: `${this.nsDeviceType}.setInterval` });
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }
}

module.exports = { LeakSensorAPIHandler };
