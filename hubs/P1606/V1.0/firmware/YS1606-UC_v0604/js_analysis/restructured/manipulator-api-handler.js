// Original webpack module: 85858 (Manipulator API handler)
const { APIHandler } = require("./api-handler-base");

class ManipulatorAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "manipulator";
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

  getState(req, res) {
    return this.common(req, res);
  }

  setState(req, res) {
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

  setDelay(req, res) {
    return this.common(req, res);
  }

  setInitState(req, res) {
    return this.common(req, res);
  }
}

module.exports = { ManipulatorAPIHandler };
