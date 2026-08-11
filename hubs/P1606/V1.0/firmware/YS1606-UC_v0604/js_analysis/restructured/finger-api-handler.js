// Original webpack module: 98670 (Finger API handler)
// "toggle" issues a hardcoded setState:"open" command directly, rather
// than forwarding caller-supplied params - and its response handler
// clears out any returned `state` field entirely (sets it null, then
// immediately deletes it - a no-op pair kept faithful to the original,
// which does exactly this).
const { APIHandler } = require("./api-handler-base");

class FingerAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "finger";
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
          result.state = null; // [sic] no-op pair, kept faithful
          delete result.state;
        }
        return result;
      });
  }
}

module.exports = { FingerAPIHandler };
