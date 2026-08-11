// Original webpack module: 77033
//
// Two "secret" schemes, both ultimately unsalted MD5 of a known-shape
// input string (subnetId:familyId, etc - see hub-remote-commands.js's
// hub.getApiState and oauth2-provider.js): a legacy hex-MD5 form
// (SignSecret) and a "v1" form (SignSecretV1) that's the same MD5, just
// base64-encoded and prefixed with "sec_v1_". Neither involves a
// per-device random secret - anyone who knows the subnetId/familyId (both
// visible in cloud API responses) can derive the same secret locally.

const { simpleMD5, MD5WithBase64 } = require("./crypto-utils");

class SignSecret {
  secret;

  constructor(secret) {
    this.secret = secret;
  }

  valid(input) {
    return this.sign(input) == this.secret;
  }

  sign(input) {
    return simpleMD5(input);
  }

  static withSecret(secret) {
    return secret.startsWith(SignSecretV1.prefix) ? new SignSecretV1(secret) : new SignSecret(secret);
  }

  static sign(input) {
    return new SignSecret().sign(input);
  }

  static signV1(input) {
    return new SignSecretV1().sign(input);
  }
}

class SignSecretV1 extends SignSecret {
  static prefix = "sec_v1_";

  sign(input) {
    return SignSecretV1.prefix + MD5WithBase64(input);
  }
}

module.exports = { SignSecret, SignSecretV1 };
