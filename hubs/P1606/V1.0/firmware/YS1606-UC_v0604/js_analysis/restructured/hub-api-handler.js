// Original webpack module: 39192 (Hub API handler)
// The real Hub-type-family API handler (distinct from
// co-smoke-sensor-api-handler.js's buggy "hub" nsDeviceType). getState
// renames the device's `lte` field to `cellular` in the response -
// wifiScan and resetLTE both get extended timeouts (16s), matching how
// slow those hub-side operations actually are on real hardware.
const { APIHandler } = require("./api-handler-base");

class HubAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "hub";
  }

  getState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        if (result.lte != null) {
          result.cellular = result.lte;
          delete result.lte;
        }
        return result;
      });
  }

  setWiFi(req, res) {
    req.body.params.authType = req.body.params.encryption || "psk-mixed";
    return this.getState(req, res);
  }

  scanWiFiList(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req, { method: `${this.nsDeviceType}.wifiScan` }, { timeout: 16000 }))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }

  resetCellular(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req, { method: `${this.nsDeviceType}.resetLTE` }))
      .then((result) => {
        if (result != null && result.location != null) delete result.location;
        return result;
      });
  }
}

module.exports = { HubAPIHandler };
