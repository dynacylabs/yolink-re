// Original webpack module: 59125
//
// Parses/matches a LoRaWAN NetID against the LoRa Alliance's NetID type
// 0-7 addressing scheme (TR005 "LoRaWAN Regional Parameters" /
// backend-interfaces spec) - used to determine whether an incoming
// DevAddr belongs to this network (see chirpstack-subnet.js / the
// loraserver-* modules) and specifically whether it's in the
// LoRaWAN-Alliance-assigned "LAN" (locally-administered) NetID range
// (type >= 6), which uses different DevAddr-prefix bit-matching rules
// than the globally-assigned types.

// A prefix-match mask for the top `prefixBits` bits of a DevAddr,
// constructed from the NetID's `idBits`-bit "network identifier" field
// per the NetID type's addressing rule.
class DevAddrPrefixMatcher {
  lbMask;

  constructor(prefixValue, prefixBits, netId, idBits) {
    this.lbMask = 0;
    this.lbMask |= prefixValue << (32 - prefixBits);
    var networkIdentifier = netId & ((1 << idBits) - 1);
    this.lbMask |= networkIdentifier << (32 - prefixBits - idBits);
  }

  matchDevAddr(devAddr) {
    return (devAddr.readUInt32BE(0) & this.lbMask) == this.lbMask;
  }
}

class LoraNetId {
  netId;
  netType;
  idFieldsLength;
  addrTypePrefix;
  _match;
  static #instances = new Map();

  constructor(netId) {
    this.netId = netId;
    this.netType = netId >> 21;
    this.idFieldsLength = 0;
    this.addrTypePrefix = 0;

    // NetID type 0-7: each type has a fixed DevAddr prefix (addrTypePrefix,
    // `prefixBits` long) followed by a NwkID field carved out of the
    // NetID's low bits (`idBits` long) - see LoRaWAN Regional Parameters
    // Table "NetID type" for the canonical version of these constants.
    switch (this.netType) {
      case 0:
        this.idFieldsLength = 6;
        this.addrTypePrefix = 0;
        this._match = new DevAddrPrefixMatcher(0, 1, netId, 6);
        break;
      case 1:
        this.idFieldsLength = 6;
        this.addrTypePrefix = 128;
        this._match = new DevAddrPrefixMatcher(128, 2, netId, 6);
        break;
      case 2:
        this.idFieldsLength = 9;
        this.addrTypePrefix = 192;
        this._match = new DevAddrPrefixMatcher(192, 3, netId, 9);
        break;
      case 3:
        this.idFieldsLength = 21;
        this.addrTypePrefix = 224;
        this._match = new DevAddrPrefixMatcher(224, 4, netId, 10);
        break;
      case 4:
        this.idFieldsLength = 21;
        this.addrTypePrefix = 240;
        this._match = new DevAddrPrefixMatcher(240, 5, netId, 11);
        break;
      case 5:
        this.idFieldsLength = 21;
        this.addrTypePrefix = 248;
        this._match = new DevAddrPrefixMatcher(248, 6, netId, 13);
        break;
      case 6:
        this.idFieldsLength = 21;
        this.addrTypePrefix = 252;
        this._match = new DevAddrPrefixMatcher(252, 7, netId, 15);
        break;
      case 7:
        this.idFieldsLength = 21;
        this.addrTypePrefix = 254;
        this._match = new DevAddrPrefixMatcher(254, 8, netId, 17);
        break;
    }
  }

  // NetID types 6-7 are the LoRaWAN Alliance's "LAN" (locally-administered
  // / private-network) range.
  isLan() {
    return this.netId >> 21 >= 6;
  }

  matchDevAddr(devAddr) {
    return this._match?.matchDevAddr(devAddr) || false;
  }

  static isLanDevAddr(devAddr) {
    return !(~devAddr[0] & 254 && ~devAddr[0] & 252);
  }

  static of(netId) {
    var instance = LoraNetId.#instances.get(netId);
    if (instance == null) {
      instance = new LoraNetId(netId);
      LoraNetId.#instances.set(netId, instance);
    }
    return instance;
  }
}

module.exports = { LoraNetId };
