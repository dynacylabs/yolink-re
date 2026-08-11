// Original webpack module: 35003
//
// The downlink-side counterpart to gateway-lora-receive.js's uplink
// dispatch - converts a ChirpStack gateway-bridge protobuf DownlinkFrame
// (gateway-proto-codec.js's parseProto2Json) into the shape
// lora-transport.js's LoraClient expects, and hands it off for actual
// radio transmission. Called from both mqtt-remote-broker.js (cloud-
// originated downlinks) and gateway-lora-receive.js (local/bridged-hub-
// originated downlinks) - same handler, regardless of which MQTT
// connection the downlink arrived over.

const { parseProto2Json } = require("./gateway-proto-codec");

function onProtoLoraDownlinkMessage(protoBuffer, gateway) {
  let frame = parseProto2Json(protoBuffer);
  gateway.loraClient
    .sendLoraDownlink(frame)
    .then((result) => {
      gateway.logger.debug(`Downlink[${frame.phyPayload}] ${result}`);
    })
    .catch((err) => {
      gateway.logger.error(err);
    });
}

module.exports = { onProtoLoraDownlinkMessage };
