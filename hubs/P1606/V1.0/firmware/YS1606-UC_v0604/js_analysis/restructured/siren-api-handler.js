// Original webpack module: 70804 (Siren API handler)
// setDuration forwards to the device-side "siren.setDuation" method -
// [sic] matching the same typo already documented at the LoRa layer
// (device-command-tables.md).
const { APIHandler } = require("./api-handler-base");

class SirenAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "siren";
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

  setDuration(req, res) {
    return this._checkDeviceToken(req)
      .then(() =>
        this._sendDeviceMessage(req, {
          method: `${this.nsDeviceType}.setDuation`, // [sic]
          targetDevice: req.body.targetDevice,
          params: { state: { alarm: req.body.params?.state?.alarm == 1 } },
        })
      )
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }
}

module.exports = { SirenAPIHandler };
