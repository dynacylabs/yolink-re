// Original webpack module: 17045
//
// LCSubnet HTTP API handler for Lock devices (see api-handler-base.js) -
// this is the worked example for the "APIHandler subclass per device
// family" pattern; other device families almost certainly have sibling
// handler modules not yet found/examined in this pass. Password-related
// methods validate PIN shape (4-8 digits, or a bare number) before
// forwarding to the device via P7616Register's opcode 48 user-management
// commands (see device-command-tables.md).

const { APIHandler } = require("./api-handler-base");

function isValidTimestamp(value) {
  return value != null && typeof value === "number" && !isNaN(value);
}

class LockAPIHandler extends APIHandler {
  constructor() {
    super();
    this.nsDeviceType = "lock";
  }

  // Strips the cached location field before returning state - locks'
  // location apparently isn't meant to be exposed via this API.
  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  common(req, res, extra) {
    return this._checkDeviceToken(req)
      .then(() => this._sendDeviceMessage(req, extra))
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

  listPasswords(req, res) {
    if (req.body.params?.limit == null || req.body.params.limit < 1 || req.body.params.limit > 10) {
      return Promise.reject(new Error("010200"));
    }
    return this.common(req, res, { method: `${this.nsDeviceType}.getUsers` });
  }

  generateOTP(req, res) {
    if (req.body.params?.pwd != null && /^\d{4}$/.test(req.body.params.pwd)) {
      req.body.params.pwd = req.body.params.pwd.toString();
      return this.common(req, res, { method: `${this.nsDeviceType}.addTemporaryPWD` });
    }
    return Promise.reject(new Error("010200"));
  }

  addPassword(req, res) {
    if (
      req.body.params?.pwd != null &&
      isValidTimestamp(req.body.params?.start) &&
      isValidTimestamp(req.body.params?.end) &&
      /^\d{4,8}$/.test(req.body.params.pwd)
    ) {
      return this.common(req, res);
    }
    return Promise.reject(new Error("010200"));
  }

  delPassword(req, res) {
    var pwd = req.body.params?.pwd;
    if (pwd != null && ((typeof pwd === "number" && !isNaN(pwd)) || /^\d{4,8}$/.test(req.body.params.pwd))) {
      return this.common(req, res);
    }
    return Promise.reject(new Error("010200"));
  }

  updatePassword(req, res) {
    if (
      req.body.params?.pwd != null &&
      req.body.params?.oldPwd != null &&
      isValidTimestamp(req.body.params?.start) &&
      isValidTimestamp(req.body.params?.end) &&
      (isValidTimestamp(req.body.params?.oldPwd) || /^\d{4,8}$/.test(req.body.params.oldPwd))
    ) {
      return this.common(req, res);
    }
    return Promise.reject(new Error("010200"));
  }

  clearPassword(req, res) {
    return this.common(req, res);
  }

  setTimeZone(req, res) {
    return this.common(req, res);
  }
}

module.exports = { LockAPIHandler };
