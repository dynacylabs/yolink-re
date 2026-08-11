// Original webpack module: 90223 (DoorSensor API handler)
// Unlike most handlers, strips `state.alertType` rather than
// top-level `location` - a door sensor's cached state apparently
// doesn't carry a location field to begin with.
const { APIHandler } = require("./api-handler-base");

class DoorSensorAPIHandler extends APIHandler {
  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state?.state?.alertType != null) delete state.state.alertType;
        return state;
      });
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }
}

module.exports = { DoorSensorAPIHandler };
