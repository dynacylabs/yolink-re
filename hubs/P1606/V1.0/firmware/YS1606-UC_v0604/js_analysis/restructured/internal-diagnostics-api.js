// Original webpack module: 26807
//
// A localhost/LAN-only diagnostics HTTP endpoint mounted at /_internal on
// the hub's Express app (see http-server.js, not yet transcribed - the
// app itself hasn't been located/examined in this pass). Gated by a
// hostname check (127.0.0.1 or 192.168.*) rather than any auth token -
// reachable by anything on the same LAN segment as the hub, not just the
// hub process itself.

const { Router } = require("express");
const { YLSubnetDevicesRepository } = require("./yl-subnet-devices-repository"); // module 65016, not yet transcribed
const { deviceNsTypeFromAppEUI } = require("./device-type-from-appeui");
const { getGatewayBaseConfig } = require("./config");
const { YLDeviceStateRepository } = require("./device-state-repository");
const { System } = require("./system-info");
const { AppCtxAttrs } = require("./app-context-attrs"); // module 3721, not yet transcribed

const router = Router();

router.use((req, res, next) => {
  if (req.hostname == "127.0.0.1" || req.hostname.startsWith("192.168.")) next();
  else res.status(403).send("Forbidden");
});

router.get("/status", async (req, res) => {
  try {
    var info = await app.getGateway().getGwGeneralInfo();
    res.json({
      online: true,
      network: app.getGateway().isRemoteMqttConnected(),
      isInApOperator: app.getGateway().isInApOperator(),
      isInAteMode: AppCtxAttrs.ateMode.get(),
      upgradingState: System.getUpgrade()?.getState()?.state ?? undefined,
      lte: info.lte?.regStateCode == 1 || info.lte?.regStateCode == 5,
      error: false,
    });
  } catch (e) {
    console.log(e);
    res.json({ online: false, network: false, lte: false, isInApOperator: false, isInAteMode: false, upgradingState: undefined, error: true });
  }
});

router.get("/subnet", (req, res) => {
  try {
    res.json({
      subnet: app.getSubnet() == null
        ? undefined
        : { id: app.getSubnet().getSubnetId(), name: app.getSubnet().getSubnet().name, hostGatewayId: getGatewayBaseConfig().gwId },
    });
  } catch (e) {
    console.log(e);
    res.json({ code: "999999" });
  }
});

router.get("/subnet/devices", async (req, res) => {
  try {
    res.json({
      devices:
        app.getSubnet() == null
          ? []
          : (await YLSubnetDevicesRepository.of().getData())?.map((device) => ({
              deviceId: device.id,
              deviceName: device.deviceName,
              appEui: device.appEui,
              devClassType: device.devClassType,
              devNSType: deviceNsTypeFromAppEUI(device.appEui),
            })) ?? [],
    });
  } catch (e) {
    console.log(e);
    res.json({ code: "999999" });
  }
});

router.get("/subnet/:deviceId/state", async (req, res) => {
  var deviceId = req.query?.deviceId ?? req.params?.deviceId;
  try {
    res.json({ state: await YLDeviceStateRepository.of().get(deviceId) });
  } catch (e) {
    res.json({ code: "999999" });
  }
});

function attachExpress(app) {
  app.use("/_internal", router);
}

module.exports = { attachExpress };
