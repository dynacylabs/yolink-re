// Original webpack module: 90989
//
// Converts between ChirpStack's gateway-bridge protobuf frames
// (DownlinkFrame/UplinkFrame - the lorawan/gw.proto messages, distinct
// from lorawan-json-codec.js's application-server-level uplink event
// protobuf) and plain JSON, for whatever transport this hub uses to talk
// to its own LoRa concentrator/radio at the gateway-bridge layer (see
// lora-transport.js). This is the lower of the two ChirpStack protobuf
// boundaries found in this bundle.

const gw = require("chirpstack-api/gw"); // original module 12137
const common = require("chirpstack-api/common"); // original module 20545

function parseProto2Json(binaryFrame) {
  var frame = gw.DownlinkFrame.deserializeBinary(binaryFrame);
  var txInfo = frame.getTxInfo();
  return {
    txInfo: {
      immediately: txInfo.getImmediately(),
      timestamp: txInfo.getTimestamp(),
      frequency: txInfo.getFrequency(),
      power: txInfo.getPower(),
      dataRate: {
        modulation: "LORA",
        bandwidth: txInfo.getLoraModulationInfo().getBandwidth(),
        spreadFactor: txInfo.getLoraModulationInfo().getSpreadingFactor(),
        codeRate: txInfo.getLoraModulationInfo().getCodeRate(),
      },
      codeRate: txInfo.getLoraModulationInfo().getCodeRate(),
      iPol: txInfo.getLoraModulationInfo().getPolarizationInversion(),
      board: txInfo.getBoard(),
      antenna: txInfo.getAntenna(),
      wake: txInfo.getWake(),
      gatewayId: Buffer.from(txInfo.getGatewayId_asU8()).toString("hex"),
    },
    phyPayload: frame.getPhyPayload_asB64(),
  };
}

// Builds an UplinkFrame protobuf from a legacy-JSON-shaped uplink (see
// lorawan-json-codec.js's shape) plus the reporting gateway's hex id.
// Several RxInfo fields (rfChain, board, antenna, location) are always
// hardcoded to 0/UNKNOWN - this hub doesn't appear to populate them from
// real hardware state.
function parseJSON2Proto(uplinkJson, gatewayIdHex) {
  var frame = new gw.UplinkFrame();
  frame.setPhyPayload(Buffer.from(uplinkJson.phyPayload, "base64"));

  var txInfo = new gw.UplinkTXInfo();
  txInfo.setModulation(common.Modulation.LORA);
  txInfo.setFrequency(uplinkJson.rxInfo.frequency);

  var modInfo = new gw.LoRaModulationInfo();
  modInfo.setCodeRate(uplinkJson.rxInfo.codeRate);
  modInfo.setSpreadingFactor(uplinkJson.rxInfo.dataRate.spreadFactor);
  modInfo.setBandwidth(uplinkJson.rxInfo.dataRate.bandwidth);
  txInfo.setLoraModulationInfo(modInfo);
  frame.setTxInfo(txInfo);

  var rxInfo = new gw.UplinkRXInfo();
  rxInfo.setGatewayId(Buffer.from(gatewayIdHex, "hex"));
  rxInfo.setTimestamp(16777215 & new Date().getTime());
  rxInfo.setChannel(uplinkJson.rxInfo.channel);
  rxInfo.setRfChain(0);
  rxInfo.setRssi(uplinkJson.rxInfo.rssi);
  rxInfo.setLoraSnr(uplinkJson.rxInfo.loraSNR);
  rxInfo.setAntenna(0);
  rxInfo.setBoard(0);

  var location = new common.Location();
  location.setLatitude(0);
  location.setLongitude(0);
  location.setAltitude(0);
  location.setSource(common.LocationSource.UNKNOWN);
  rxInfo.setLocation(location);

  frame.setRxInfo(rxInfo);
  return Buffer.from(frame.serializeBinary());
}

module.exports = { parseProto2Json, parseJSON2Proto };
