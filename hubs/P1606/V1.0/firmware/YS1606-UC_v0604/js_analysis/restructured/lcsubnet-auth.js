// Original webpack module: 64899
//
// Auth-context types for the LCSubnet local API. LCSubnetAuth derives its
// "secret key" the same MD5(id:familyId) way as everywhere else in this
// bundle - hasPermission() is an unconditional Promise.resolve(true),
// i.e. any caller holding a valid token for this subnet gets full
// permission, there's no finer-grained scope enforcement here.

const { simpleMD5 } = require("./crypto-utils");

class APIAuth {
  userId;
  appId;
  secKey;
  type;

  constructor(userId, appId, type, secKey) {
    this.userId = userId;
    this.appId = appId;
    this.type = type;
    this.secKey = secKey;
  }
}

class LCSubnetAuth extends APIAuth {
  constructor(subnet) {
    super(subnet.familyId, subnet.id, "Subnet", simpleMD5(subnet.id + ":" + subnet.familyId));
  }

  hasPermission(scope) {
    return Promise.resolve(true);
  }
}

class APIRequestContext {
  auth;
  adaptors;
  requestType;

  constructor(auth, requestType) {
    this.auth = auth;
    this.adaptors = new Map();
    this.requestType = requestType;
  }
}

// Unused stub - no methods implemented beyond the empty doAPIV2().
class OpenAPI {
  doAPIV2() {}
}

module.exports = { APIAuth, LCSubnetAuth, APIRequestContext, OpenAPI };
