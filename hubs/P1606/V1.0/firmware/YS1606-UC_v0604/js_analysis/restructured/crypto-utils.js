// Original webpack module: 25518
const crypto = require("crypto");

function encryptHash(input) {
  let hash = crypto.createHash("md5");
  hash.update(input);
  return hash.digest("hex");
}

function simpleMD5(input) {
  var hash = crypto.createHash("md5");
  hash.update(input);
  return hash.digest("hex").toUpperCase();
}

function MD5WithBase64(input) {
  var hash = crypto.createHash("md5");
  hash.update(input);
  return hash.digest("base64");
}

function shortHash(input) {
  return encryptHash(input).substring(0, 16).toLowerCase();
}

module.exports = { encryptHash, simpleMD5, MD5WithBase64, shortHash };
