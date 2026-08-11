// Original webpack module: 64684 (LockV2 API handler)
// nsDeviceType is "MFLock" (multi-factor lock), not "lockV2"/"lock" -
// see device-api-handler-tables.md's note on this naming.
const { APIHandler } = require("./api-handler-base");

class LockV2APIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "MFLock";
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

  userManagement(req, res) {
    return this.common(req, res);
  }

  setAttributes(req, res) {
    return this.common(req, res);
  }
}

module.exports = { LockV2APIHandler };
