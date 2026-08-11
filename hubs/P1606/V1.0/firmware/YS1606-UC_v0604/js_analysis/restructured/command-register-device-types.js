// Original webpack module: 81888
//
// Registers the CommandRegister-pattern device types (the water-meter/
// valve-controller family - see device-command-tables.md) by product
// number key, using lora-packet-codec.js's Protocol.LoraCAN namespace.
//
// FINDING: this reveals two product-number keys not previously
// documented in device-command-tables.md - "5008" and "5018" both use
// the SAME P5006Register codec (module 85430) as "5006" and "5007" do,
// not separate handler classes. device-command-tables.md's existing
// "P5006/P5007/P5009Register" row should be read as covering five
// product numbers (5006, 5007, 5008, 5009, 5018), not three.

const { Protocol } = require("./lora-packet-codec");
const { P5006Register, P5007Register, P5009Register } = require("./device-handlers/p5006-p5007-p5009-register"); // module 85430, fully transcribed
const { P5029Register } = require("./device-handlers/p5029-register"); // module 18838, fully transcribed

function register(decoderRegister, encoderRegister) {
  P5006Register.apply(Protocol.LoraCAN, "5006", encoderRegister, decoderRegister);
  P5007Register.apply(Protocol.LoraCAN, "5007", encoderRegister, decoderRegister);
  P5006Register.apply(Protocol.LoraCAN, "5008", encoderRegister, decoderRegister);
  P5006Register.apply(Protocol.LoraCAN, "5018", encoderRegister, decoderRegister);
  P5009Register.apply(Protocol.LoraCAN, "5009", encoderRegister, decoderRegister);
  P5029Register.apply(Protocol.LoraCAN, "5029", encoderRegister, decoderRegister);
}

module.exports = { register };
