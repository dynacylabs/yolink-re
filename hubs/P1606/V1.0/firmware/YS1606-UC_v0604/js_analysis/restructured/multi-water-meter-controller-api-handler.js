// Original webpack module: 76893 (MultiWaterMeterController API handler)
//
// FINDING: byte-for-byte identical to water-meter-controller-api-handler.js
// (module 83485) - same pattern as SwitchRegister/OutletRegister sharing
// an identical command table at the LoRa layer. Kept as two separate
// files, matching the original bundle's genuine duplication, rather than
// merged.
const { APIHandler } = require("./api-handler-base");

class MultiWaterMeterControllerAPIHandler extends APIHandler {
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

  setTimeZone(req, res) {
    return this.common(req, res);
  }

  getState(req, res) {
    return this.common(req, res);
  }

  setAttributes(req, res) {
    return this.common(req, res);
  }

  setState(req, res) {
    return this.common(req, res);
  }

  setDelay(req, res) {
    return this.common(req, res);
  }

  getValveSchedules(req, res) {
    return this.common(req, res);
  }

  setValveSchedules(req, res) {
    return this.common(req, res);
  }

  getLeakSchedules(req, res) {
    return this.common(req, res);
  }

  setLeakSchedules(req, res) {
    return this.common(req, res);
  }

  setMeterAttributes(req, res) {
    return this.common(req, res);
  }
}

module.exports = { MultiWaterMeterControllerAPIHandler };
