// Original webpack module: 76231
//
// Parses just enough of a raw LoRaWAN PHYPayload to classify its MHDR
// message type and extract routing-relevant fields (AppEUI/DevEUI for
// JoinRequest, DevAddr for data uplinks) - used by gateway-lora-receive.js
// to decide local (LAN/bridged-hub) vs remote (cloud) routing before any
// full YoLink-layer decode happens.

const { LoraNetId } = require("./lora-net-id");

const MHDR_MESSAGE_TYPES = [
  "JoinRequest", "JoinAccept", "UnconfirmedDataUp", "UnconfirmedDataDown",
  "ConfirmedDataUp", "ConfirmedDataDown", "RFU", "Proprietary",
];

class DevAddr {
  devAddr;
  buf;

  constructor(buf) {
    this.devAddr = buf;
    this.buf = buf;
  }

  isLan() {
    return LoraNetId.isLanDevAddr(this.buf);
  }

  matchNetId(netId) {
    return LoraNetId.of(netId).matchDevAddr(this.buf);
  }
}

function getMetadataFromLoraUplink(phyPayload) {
  var type = MHDR_MESSAGE_TYPES[phyPayload.readUInt8(0) >> 5];
  switch (type) {
    case "JoinRequest":
      return { type, appEUI: phyPayload.subarray(1, 9).reverse(), devEUI: phyPayload.subarray(9, 17).reverse() };
    case "UnconfirmedDataUp":
    case "ConfirmedDataUp":
      return { type, devAddr: new DevAddr(phyPayload.subarray(1, 5).reverse()) };
  }
}

module.exports = { getMetadataFromLoraUplink, DevAddr };
