// Original webpack module: 90107 (VibrationSensor API handler)
const { APIHandler } = require("./api-handler-base");

class VibrationSensorAPIHandler extends APIHandler {
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

module.exports = { VibrationSensorAPIHandler };
