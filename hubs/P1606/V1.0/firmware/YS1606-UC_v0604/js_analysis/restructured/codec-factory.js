// Original webpack module: 79390
//
// Central lookup for "given this AppEUI, get me the right
// decoder/encoder" - this is what LoraUpLinkDataPacket.build() and
// LoraDownlinkDataPacket's constructor (lora-packet-codec.js) actually
// call. Delegates registration to 6 grouping modules (originals 81888,
// 83576, 27389, 10426, 8110, 73954 - not transcribed in this pass, each
// is presumed to call `.register()` for a batch of related device types
// against the shared CommandDecoderRegister/CommandEncoderRegister).
//
// NOTE ON AN OPEN QUESTION: it wasn't fully pinned down in this pass
// exactly how DataPacket-subclass handlers (door-sensor.js's pattern)
// plug into this factory vs. CommandRegister-based ones
// (command-register-handlers.js's pattern) - both patterns clearly
// coexist in the bundle, but the precise wiring between "which AppEUI
// maps to which pattern" wasn't traced all the way through. Flagging
// honestly rather than guessing.

const { Protocol, DeviceDecoderRegister, DeviceEncoderRegister } = require("./lora-packet-codec");
const { deviceNsTypeFromModelKey } = require("./device-type-from-appeui");

const decoderRegistry = new DeviceDecoderRegister();
const encoderRegistry = new DeviceEncoderRegister();

// original modules 81888, 83576, 27389, 10426, 8110, 73954 - each exports
// a register(decoderRegistry, encoderRegistry) that adds its own batch of
// device-type codecs.
require("./codec-registration-groups").registerAll(decoderRegistry, encoderRegistry);

// Falls back from an exact model-key lookup to a looked-up "canonical"
// model key (deviceNsTypeFromModelKey) if the direct lookup misses -
// handles model variants that share one codec.
function lookupWithModelFallback(spaceOrClassType, modelKey, lookupFn) {
  let result = lookupFn(spaceOrClassType, modelKey);
  if (result == null) {
    const canonicalModelKey = deviceNsTypeFromModelKey(modelKey);
    if (canonicalModelKey != null) result = lookupFn(spaceOrClassType, canonicalModelKey);
  }
  return result;
}

class CodecFactory {
  static getDecoder(spaceOrClassType, modelKey) {
    return decoderRegistry.getDecoder(spaceOrClassType, modelKey);
  }
  static getEncoder(spaceOrClassType, modelKey) {
    return encoderRegistry.getEncoder(spaceOrClassType, modelKey);
  }

  // AppEUI layout: 6 hex chars device-ID-prefix ("d88b4c") + 4 hex chars
  // model key + ... + 2 hex chars (offset 12-14) devClassType-ish index.
  static getDecoderByAppEUI(appEUI) {
    const prefix = appEUI.substring(0, 6);
    const modelKey = appEUI.substring(6, 10);
    const classTypeIndex = parseInt(appEUI.substring(12, 14));
    if (prefix === "d88b4c") return lookupWithModelFallback(classTypeIndex, modelKey, CodecFactory.getDecoder);
  }

  static getEncoderByAppEUI(appEUI) {
    const prefix = appEUI.substring(0, 6);
    const modelKey = appEUI.substring(6, 10);
    if (prefix === "d88b4c") return lookupWithModelFallback(Protocol.LoraCAN, modelKey, CodecFactory.getEncoder);
  }

  static getEncodersByType(deviceType) {
    return encoderRegistry.getEncodersByDeviceType(deviceType);
  }
}

module.exports = { CodecFactory };
