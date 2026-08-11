// Original webpack module: 77680 (WaterDepthSensor API handler)
// Note getState delegates to fetchState (cached state) rather than
// common() (a live device round-trip) - inconsistent with most other
// setAttributes-style handlers, but kept faithful to the source.
const { APIHandler } = require("./api-handler-base");

class WaterDepthSensorAPIHandler extends APIHandler {
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

  getState(req, res) {
    return this.fetchState(req, res);
  }

  setAttributes(req, res, extraFields) {
    return this.common(req, res, extraFields);
  }
}

module.exports = { WaterDepthSensorAPIHandler };
