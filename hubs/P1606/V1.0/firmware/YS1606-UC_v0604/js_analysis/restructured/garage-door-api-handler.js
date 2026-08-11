// Original webpack module: 61179 (GarageDoor API handler)
// Same "toggle" hardcoded-open pattern as finger-api-handler.js.
const { APIHandler } = require("./api-handler-base");

class GarageDoorAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "garageDoor";
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
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }

  toggle(req, res) {
    return this._checkDeviceToken(req)
      .then(() =>
        this._sendDeviceMessage(req, {
          method: `${this.nsDeviceType}.setState`,
          params: { state: "open" },
          targetDevice: req.body.targetDevice,
        })
      )
      .then((result) => {
        if (result?.state) {
          result.state = null;
          delete result.state;
        }
        return result;
      });
  }
}

module.exports = { GarageDoorAPIHandler };
