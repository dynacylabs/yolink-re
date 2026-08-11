// Original webpack module: 27389
// Registers P7616Register (device-command-tables.md's lock handler,
// module 52429) under three product-number keys, not just "7616" -
// "7617" and "7618" share the exact same codec too.
const { Protocol } = require("./lora-packet-codec");
const { P7616Register } = require("./device-handlers/p7616-register"); // module 52429, fully transcribed

function register(decoderRegister, encoderRegister) {
  P7616Register.apply(Protocol.LoraCAN, "7616", encoderRegister, decoderRegister);
  P7616Register.apply(Protocol.LoraCAN, "7617", encoderRegister, decoderRegister);
  P7616Register.apply(Protocol.LoraCAN, "7618", encoderRegister, decoderRegister);
}

module.exports = { register };
