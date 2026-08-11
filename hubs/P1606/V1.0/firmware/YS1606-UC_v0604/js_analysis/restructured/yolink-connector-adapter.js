// Original webpack module: 57488
//
// Per-HTTP-request adapter (cached on the request's auth context) that
// bridges an incoming LCSubnet API request to a general-client.js
// Client instance and validates per-device tokens. Device tokens are
// SignSecret(deviceId + auth.secKey) - i.e. derivable by anyone who
// already has the subnet's secKey (itself MD5(subnetId:familyId), see
// lcsubnet-auth.js) plus the target deviceId.

const { SignSecret } = require("./sign-secret");
const { getGeneralClient } = require("./general-client");

class YoLinkConnectorAdapter {
  request;

  constructor(request) {
    this.request = request;
  }

  getClient() {
    return getGeneralClient(this.request.context.auth.appId);
  }

  checkDeviceToken() {
    return new Promise((resolve, reject) => {
      if (
        this.request.body.targetDevice != null &&
        this.request.body.token != null &&
        SignSecret.withSecret(this.request.body.token).valid(this.request.body.targetDevice + this.request.context.auth.secKey)
      ) {
        resolve(true);
      } else {
        reject(new Error("000103"));
      }
    });
  }

  static withRequest(req) {
    let key = "__yolink_connector_adapter_";
    if (req.context.adaptors == null) req.context.adaptors = new Map();
    if (!req.context.adaptors.has(key)) req.context.adaptors.set(key, new YoLinkConnectorAdapter(req));
    return req.context.adaptors.get(key);
  }
}

module.exports = { YoLinkConnectorAdapter };
