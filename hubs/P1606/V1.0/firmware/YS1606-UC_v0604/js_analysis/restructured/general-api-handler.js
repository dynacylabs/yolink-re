// Original webpack module: 16491
//
// A second APIHandler subclass (sibling to lock-api-handler.js) - the
// generic/subnet-wide one, not scoped to a device family: lists every
// device on the subnet with a per-device signed token (getDeviceList),
// an apparently-broken/incomplete variant (getDeviceList2 - see note),
// and basic hub identity info (getGeneralInfo). All three reject with
// "Unsupported" unless the request's auth is an LCSubnetAuth (i.e. came
// through the subnet-scoped OAuth2 flow, not some other auth type this
// bundle doesn't otherwise use).
//
// Per-device tokens here are SignSecret.sign(deviceId + auth.secKey) -
// unsalted, and auth.secKey is itself just MD5(subnetId:familyId) (see
// lcsubnet-auth.js) - so these "device tokens" are exactly as derivable
// as everything else in this bundle's auth chain.

const { LCSubnetAuth } = require("./lcsubnet-auth");
const { APIHandler } = require("./api-handler-base");
const { SignSecret } = require("./sign-secret");
const { deviceNsTypeFromAppEUI } = require("./device-type-from-appeui");
const { YLSubnetDevicesRepository } = require("./yl-subnet-devices-repository");
const { translateNSType } = require("./message-dispatcher");

function getSubnetDevices() {
  return YLSubnetDevicesRepository.of().getData();
}

class GeneralAPIHandler extends APIHandler {
  getDeviceList(req, res) {
    if (!(req.context.auth instanceof LCSubnetAuth)) return Promise.reject(new Error("Unsupported"));
    return getSubnetDevices().then((devices) => {
      let list = [];
      if (devices && devices.length) {
        devices.forEach((device) => {
          var nsType = deviceNsTypeFromAppEUI(device.appEui);
          var type = nsType != null ? translateNSType(nsType) : undefined;
          if (type != null) {
            list.push({
              deviceId: device.id,
              name: device.deviceName,
              token: SignSecret.sign(device.id + req.context.auth.secKey),
              type,
            });
          }
        });
      }
      return { devices: list };
    });
  }

  // NOTE: this reads `devices?.data?.devices` off the repository result,
  // but getSubnetDevices()/YLSubnetDevicesRepository.getData() returns a
  // plain array (same as getDeviceList above uses directly) - there's no
  // `.data.devices` nesting anywhere else in this codebase. This method
  // as shipped always returns `{ devices: undefined }`. [sic] - kept
  // faithful to shipped (apparently broken) behavior.
  getDeviceList2(req, res) {
    if (!(req.context.auth instanceof LCSubnetAuth)) return Promise.reject(new Error("Unsupported"));
    return getSubnetDevices().then((result) => {
      let devices = result?.data?.devices;
      return { devices };
    });
  }

  getGeneralInfo(req, res) {
    if (req.context.auth instanceof LCSubnetAuth) {
      let id = req.context.auth.userId;
      return Promise.resolve({ id });
    }
    return Promise.reject(new Error("Unsupported"));
  }
}

module.exports = { GeneralAPIHandler };
