// Original webpack module: 21285 (APIHandler) + 52167 (loadState)
//
// Base class for the LCSubnet HTTP API's per-device-type-family request
// handlers (see lock-api-handler.js for the one worked example found so
// far - other nsDeviceType families likely have their own handler
// modules elsewhere in the still-unexamined remainder). handler(req, res)
// dynamically dispatches to a same-named method based on the last segment
// of req.body.method (e.g. "lock.getState" -> this.getState(req, res)).
//
// NOTE: _getCachedState's loadState (module 52167) is a second,
// independent implementation of the exact same logic as
// device-state-store.js's loadState (module 62937) - both just delegate
// to YLDeviceStateRepository.of().get(deviceId). Kept faithful to the
// original rather than merged - the bundle genuinely defines this twice.

const { YoLinkConnectorAdapter } = require("./yolink-connector-adapter");
const { YLDeviceStateRepository } = require("./device-state-repository");

function loadState(deviceId) {
  return YLDeviceStateRepository.of().get(deviceId);
}

class APIHandler {
  nsDeviceType;

  constructor(nsDeviceType) {
    this.nsDeviceType = nsDeviceType;
  }

  _getYoLinkConnector(req) {
    return YoLinkConnectorAdapter.withRequest(req).getClient();
  }

  _checkDeviceToken(req) {
    return YoLinkConnectorAdapter.withRequest(req).checkDeviceToken();
  }

  // Rewrites req.body.method's family prefix to this handler's
  // nsDeviceType before forwarding to the device (e.g. a generic
  // "lock.getState" call always gets re-prefixed to match whichever
  // concrete device family this handler instance represents).
  _sendDeviceMessage(req, res, extra) {
    let method = req.body.method;
    if (this.nsDeviceType != null) method = this.nsDeviceType + "." + method.split(".")[1];
    return new Promise((resolve, reject) => {
      this._getYoLinkConnector(req).sendDeviceMessage(
        Object.assign({ method, params: req.body.params, targetDevice: req.body.targetDevice }, extra),
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        },
        res
      );
    });
  }

  // Cached last-known device state, with online-ness inferred from
  // whether the last report is more recent than `maxAgeMs` (default 16h)
  // and loraInfo stripped before returning to the API caller.
  _getCachedState(req, maxAgeMs = 57600000) {
    return loadState(req.body.targetDevice).then((state) => {
      if (state) {
        var reportAt = state.reportAt || state.updatedAt;
        var result = { online: false, state: state.deviceState, deviceId: state.deviceId, reportAt: state.reportAt || state.updatedAt };
        if (result.state) {
          delete result.state.loraInfo;
          result.online = reportAt !== undefined && reportAt.getTime() > Date.now() - maxAgeMs;
        }
        return result;
      }
      return { state: undefined };
    });
  }

  handler(req, res) {
    let methodName = req.body.method;
    if (req.body.method.indexOf(".") > 0) methodName = req.body.method.split(".")[1];
    let fn = this[methodName];
    return fn != null ? fn.call(this, req, res) : Promise.reject(new Error("010203"));
  }

  handleCallback(req, res, result) {
    return result;
  }
}

module.exports = { APIHandler };
