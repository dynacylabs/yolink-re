// Original webpack module: 39035 (MotionSensor API handler)
const { APIHandler } = require("./api-handler-base");

class MotionSensorAPIHandler extends APIHandler {
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

module.exports = { MotionSensorAPIHandler };
