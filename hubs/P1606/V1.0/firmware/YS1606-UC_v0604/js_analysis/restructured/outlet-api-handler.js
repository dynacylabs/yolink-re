// Original webpack module: 29924 (Outlet API handler)
// setSchedule (singular) is a legacy alias that forwards to the same
// device-side "outlet.setSchedules" method as setSchedules itself.
const { APIHandler } = require("./api-handler-base");

class OutletAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "outlet";
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

  setSchedule(req, res) {
    return this.common(req, res, { method: `${this.nsDeviceType}.setSchedules` });
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

module.exports = { OutletAPIHandler };
