// Original webpack module: 58877
//
// Two-stage translation from a ChirpStack protobuf uplink event message
// down to YoLink's own binary envelope:
//   1. parseLorawan2LegacyLoraJson - flattens the ChirpStack protobuf
//      object into the JSON shape the older "loraserver" (pre-ChirpStack)
//      project used to emit over MQTT - kept for backward compat with
//      the rest of this codebase, which was clearly written against that
//      older shape (see loraserver-pipe.js).
//   2. parseLorawan2YSStd - peels YoLink's own envelope off the LoRaWAN
//      FRMPayload: an optional 1-byte header (top bit set = present) that
//      packs a protocol version (pv, 3 bits) and device-variant (dv, 5
//      bits), followed - for pv 0 or 1 only - by a 1-byte "buzNo"
//      (business/message number?) and a 1-byte additive checksum over
//      the remaining payload bytes. Anything with an unrecognized pv (2
//      or 3) or a failed checksum is silently dropped (returns
//      undefined).

function parseLorawan2LegacyLoraJson(uplinkEvent) {
  return {
    applicationID: uplinkEvent.getDeviceInfo().getApplicationId(),
    applicationName: uplinkEvent.getDeviceInfo().getApplicationName(),
    deviceName: uplinkEvent.getDeviceInfo().getDeviceName(),
    devEUI: uplinkEvent.getDeviceInfo().getDevEui(),
    rxInfo: uplinkEvent.getRxInfoList().map((rx) => ({
      gatewayID: rx.getGatewayId(),
      name: rx.getGatewayId(),
      rssi: rx.getRssi(),
      loRaSNR: rx.getSnr(),
      location: { latitude: 0, longitude: 0, altitude: 0, source: "default" },
    })),
    txInfo: {
      frequency: uplinkEvent.getTxInfo().getFrequency(),
      dr: uplinkEvent.getTxInfo().getModulation().getLora().getCodeRate(),
    },
    adr: uplinkEvent.getAdr(),
    fCnt: uplinkEvent.getFCnt(),
    fPort: uplinkEvent.getFPort(),
    devNetType: "A",
    data: Buffer.from(uplinkEvent.getData_asU8()).toString("base64"),
  };
}

function parseLorawan2YSStd(legacyMsg) {
  let payload = Buffer.from(legacyMsg.data, "base64");
  let version = { pv: -1, dv: 0 };

  if ((payload[0] & 128) > 0) {
    version.pv = (payload[0] & 96) >> 5;
    version.dv = payload[0] & 31;
  }

  let buzNo = 0;
  if (version.pv == -1) {
    buzNo = 0;
  } else {
    if (version.pv != 0 && version.pv != 1) return; // unsupported protocol version - drop
    buzNo = payload[1];
    let checksum = 0;
    for (let i = 3; i < payload.length; i++) checksum += payload[i];
    if (payload[2] != (checksum & 255)) return; // checksum mismatch - drop
    payload = payload.slice(3);
  }

  return {
    appInfo: { id: legacyMsg.applicationID, key: legacyMsg.applicationName },
    deviceId: legacyMsg.devEUI,
    device: { name: legacyMsg.deviceName, id: legacyMsg.devEUI },
    rxInfo: legacyMsg.rxInfo,
    txInfo: legacyMsg.txInfo,
    other: { adr: legacyMsg.adr, fCnt: legacyMsg.fCnt, fPort: legacyMsg.fPort, devNetType: legacyMsg.devNetType },
    data: payload,
    buzNo,
    ver: version,
  };
}

module.exports = { parseLorawan2LegacyLoraJson, parseLorawan2YSStd };
