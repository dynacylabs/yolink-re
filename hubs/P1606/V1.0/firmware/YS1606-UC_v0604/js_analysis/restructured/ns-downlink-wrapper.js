// Original webpack module: 70409
// A singleton wrapper ("legacy loraserver Network Server client"-shaped
// interface, given the name) around app.getSubnet().sendLoraTxMessage -
// presumably kept as an adapter for some older call site expecting the
// pre-ChirpStack "NS" client API rather than calling the subnet directly.
class LegacyNSClient {
  sendDeviceCommand(deviceId, payload, options) {
    var subnet = app.getSubnet();
    if (subnet == null) return Promise.reject("No subnet found");
    return subnet
      .sendLoraTxMessage(deviceId, payload, { confirmed: options?.confirmed ?? true, fPort: options?.fPort ?? 1 })
      .then(() => {});
  }
}

class NSDownlinkWraper { // [sic] "Wraper"
  static _oldClientInited = false; // [sic] set but never read - dead field in the original
  static #oldClient;

  static get(context) {
    if (NSDownlinkWraper.#oldClient == null) NSDownlinkWraper.#oldClient = new LegacyNSClient();
    return NSDownlinkWraper.#oldClient;
  }
}

module.exports = { NSDownlinkWraper };
