// Original webpack modules: 10426, 8110, 83576
// Three more one-line CommandRegister wiring modules, each registering a
// single product-number key (contrast command-register-device-types.js
// and p7616-lock-family-registration.js, whose source modules each cover
// multiple keys with one handler class).
const { Protocol } = require("./lora-packet-codec");
const { OutletRegister } = require("./device-handlers/outlet-register"); // module 69987, fully transcribed
const { SwitchRegister } = require("./device-handlers/switch-register"); // module 11039, fully transcribed
const { P5005Register } = require("./device-handlers/p5005-register"); // module 78025, fully transcribed

function registerOutlet(decoderRegister, encoderRegister) { // original module 10426
  OutletRegister.apply(Protocol.LoraCAN, "outlet", encoderRegister, decoderRegister);
}

function registerSwitch(decoderRegister, encoderRegister) { // original module 8110
  SwitchRegister.apply(Protocol.LoraCAN, "switch", encoderRegister, decoderRegister);
}

function registerP5005(decoderRegister, encoderRegister) { // original module 83576
  P5005Register.apply(Protocol.LoraCAN, "5005", encoderRegister, decoderRegister);
}

module.exports = { registerOutlet, registerSwitch, registerP5005 };
