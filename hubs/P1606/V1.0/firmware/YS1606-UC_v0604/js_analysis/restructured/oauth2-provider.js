// Original webpack module: 52147
//
// OAuth2 token grant/verification for the LCSubnet local API - backs
// hub-remote-commands.js's hub.getApiState command and whatever HTTP
// route (in the not-yet-transcribed Express app) accepts these grants.
// All three grant types (authorization_code is stubbed out/unsupported)
// ultimately check the caller's secret against SignSecret-derived values
// keyed off the hub's own subnet id/familyId - no external identity
// provider involved.

const { SignSecret } = require("./sign-secret");
const { LCSubnetTokenParser, JWTToken } = require("./lcsubnet-token");
const { LCSubnetAuth } = require("./lcsubnet-auth");
const { simpleMD5 } = require("./crypto-utils");

class AbstractOAuth2Channel {
  grantAuthorizationCode(clientId, code, redirectUri, scope, extra) {
    throw new Error("Method not implemented.");
  }

  grantToken(request) {
    switch (request.grant_type) {
      case "authorization_code":
        return request.code == null
          ? Promise.reject(new Error("code not existed"))
          : this.grantTokenByAuthCode(request.client_id, request.code, request.redirect_uri);
      case "client_credentials":
        return request.client_secret == null
          ? Promise.reject(new Error("client_secret not existed"))
          : this.grantTokenByClientCredential(request.client_id, request.client_secret, request.scope);
      case "refresh_token":
        return request.refresh_token == null
          ? Promise.reject(new Error("refresh_token not existed"))
          : this.grantTokenByRefreshToken(request.client_id, new JWTToken(request.refresh_token), request.scope);
      default:
        return Promise.reject(new Error("grant_type not supported"));
    }
  }
}

// The one concrete grant channel this hub supports: the local subnet
// itself, identified/authenticated purely by knowing its own id+familyId
// (see SignSecret / LCSubnetAuth).
class SubnetCredentialChannel extends AbstractOAuth2Channel {
  checkAccessToken(token) {
    return new Promise((resolve, reject) => {
      let claim = LCSubnetTokenParser.analysisTokenClaim(token);
      if (claim.familyId == null || claim.id == null) {
        reject(new Error("invalid access_token"));
        return;
      }
      let subnet = app.getSubnet()?.getSubnet();
      if (subnet?.id == claim.id && subnet.familyId == claim.familyId) {
        token.verify(simpleMD5(subnet.id + ":" + subnet.familyId), (err, decoded) => {
          if (err != null || decoded == null) reject(new Error("invalid access_token"));
          else if (decoded.exp < Math.floor(new Date().getTime() / 1000)) reject(new Error("access_token expired"));
          else resolve(new LCSubnetAuth(subnet));
        });
      } else {
        reject(new Error("Auth Failed"));
      }
    });
  }

  grantTokenByAuthCode(clientId, code, redirectUri) {
    return Promise.reject(new Error("Not Supported"));
  }

  grantTokenByRefreshToken(clientId, refreshToken, scope) {
    return new Promise((resolve, reject) => {
      var claim = LCSubnetTokenParser.analysisTokenClaim(refreshToken);
      if (clientId != claim.id) {
        reject(new Error("refresh_token not support this client_id"));
        return;
      }
      let subnet = app.getSubnet()?.getSubnet();
      if (subnet?.id == claim.id && subnet.familyId == claim.familyId) {
        // Note the extra ":loraNetId" suffix on the refresh-token secret -
        // differs from the access-token secret, so a stolen access token
        // alone can't be replayed as a refresh token or vice versa.
        refreshToken.verify(simpleMD5(subnet.id + ":" + subnet.familyId + ":" + subnet.loraNetId), (err, decoded) => {
          if (err != null || decoded == null) reject(new Error("invalid refresh_token"));
          else if (decoded.exp < Math.floor(new Date().getTime() / 1000)) reject(new Error("refresh_token expired"));
          else resolve(this.genToken(subnet, 7200));
        });
      } else {
        reject(new Error("Auth Failed"));
      }
    });
  }

  grantTokenByClientCredential(clientId, clientSecret, scope) {
    return new Promise((resolve, reject) => {
      let subnet = app.getSubnet()?.getSubnet();
      if (subnet?.id == clientId && SignSecret.withSecret(clientSecret).valid(simpleMD5(subnet.id + ":" + subnet.familyId))) {
        resolve(this.genToken(subnet, 7200));
      } else {
        reject(new Error("Auth Failed"));
      }
    });
  }

  buildToken(subnet, ttlSeconds, secret) {
    return LCSubnetTokenParser.buildToken(subnet, secret, ttlSeconds).toString();
  }

  genToken(subnet, ttlSeconds) {
    return {
      access_token: this.buildToken(subnet, ttlSeconds, simpleMD5(subnet.id + ":" + subnet.familyId)),
      token_type: "bearer",
      expires_in: ttlSeconds,
      refresh_token: this.buildToken(subnet, 2592000, simpleMD5(subnet.id + ":" + subnet.familyId + ":" + subnet.loraNetId)),
      scope: ["create"],
    };
  }
}

class OAuth2Provider {
  static #instance;
  credentialChannel;

  constructor() {
    this.credentialChannel = new SubnetCredentialChannel();
  }

  grantToken(request) {
    return new Promise((resolve, reject) => {
      if (request.client_id == null) reject(new Error("client_id not existed"));
      else resolve(this.credentialChannel);
    }).then((channel) => channel.grantToken(request));
  }

  checkAccessToken(token) {
    return new Promise((resolve, reject) => {
      try {
        token.getDecoded();
      } catch (e) {
        reject(e);
        return;
      }
      resolve(this.credentialChannel);
    }).then((channel) => channel.checkAccessToken(token));
  }

  static sharedInstance() {
    if (OAuth2Provider.#instance == null) OAuth2Provider.#instance = new OAuth2Provider();
    return OAuth2Provider.#instance;
  }
}

module.exports = { OAuth2Provider };
