// Original webpack module: 85672
//
// JWT issuing/parsing for the LCSubnet local API - the tokens
// oauth2-provider.js hands back from hub.getApiState.
//
// FINDING: InternalIssuers embeds a THIRD hardcoded credential pair
// (alongside mqtt-local-broker.js's AUTH_TABLE and general-client.js's
// "as" MQTT password) - a static issuer id + signing key for a
// "default_api" internal issuer, present verbatim in every hub running
// this firmware build. CONFIRMED DEAD CODE: grepping every caller of
// this module across the whole bundle turns up exactly two consumers
// (oauth2-provider.js and http-api-wrapper.js), and both only use
// LCSubnetTokenParser/JWTToken from it - neither references
// InternalIssuers at all. Nothing in this firmware build actually calls
// InternalIssuers.sharedInstance() or getAPIDefaultIssuer().

const jwt = require("jsonwebtoken");

class InternalIssuers {
  static #instance;
  issuers;

  constructor() {
    this.issuers = {};
    this.initParams();
  }

  initParams() {
    this.issuers.default_api = {
      iss: "d038011f5d92475582f086668297fca3",
      key: "3223ad4d0ec14c64bb0e1408664ff78e",
    };
  }

  getAPIDefaultIssuer() {
    return this.issuers.default_api;
  }

  static sharedInstance() {
    if (InternalIssuers.#instance == null) InternalIssuers.#instance = new InternalIssuers();
    return InternalIssuers.#instance;
  }
}

class JWTToken {
  access_token;
  #decoded;

  constructor(accessToken) {
    this.access_token = accessToken;
  }

  getDecoded() {
    if (this.#decoded == null) this.#decoded = jwt.decode(this.access_token, { json: true });
    return this.#decoded;
  }

  verify(secret, callback) {
    jwt.verify(this.access_token, secret, (err, decoded) => {
      if (decoded != null) this.#decoded = decoded;
      callback(err ?? undefined, decoded);
    });
  }

  toString() {
    return this.access_token;
  }

  static isJWT(token) {
    if (token == null || token.length == null || token.length < 48) return false;
    let parts = token.split(".");
    return parts.length == 3 && parts[0].length > 12 && parts[1].length > 12 && parts[2].length > 12;
  }
}

class LCSubnetTokenParser {
  static buildClaim(subnet, ttlSeconds) {
    let now = Math.floor(new Date().getTime() / 1000);
    return {
      iat: now,
      exp: now + ttlSeconds,
      iss: subnet.id,
      aud: subnet.familyId,
      sub: subnet.familyId,
      scope: ["as/au"],
    };
  }

  static buildToken(subnet, secret, ttlSeconds) {
    return new JWTToken(jwt.sign(this.buildClaim(subnet, ttlSeconds), secret));
  }

  static analysisTokenClaim(token) { // [sic] "analysis" used as a verb
    try {
      var decoded = token.getDecoded();
      return { id: decoded.iss, familyId: decoded.aud };
    } catch (e) {
      throw new Error("Unsupported Token");
    }
  }
}

module.exports = { InternalIssuers, JWTToken, LCSubnetTokenParser };
