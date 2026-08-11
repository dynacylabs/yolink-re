// Original webpack module: 43160 (THSensor API handler)
// Uses a 3-hour cache-freshness window (10800000ms) instead of the
// 16-hour default - temperature/humidity sensors report far more
// frequently than most other device types.
const { APIHandler } = require("./api-handler-base");

class THSensorAPIHandler extends APIHandler {
  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req, 10800000))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }
}

module.exports = { THSensorAPIHandler };
