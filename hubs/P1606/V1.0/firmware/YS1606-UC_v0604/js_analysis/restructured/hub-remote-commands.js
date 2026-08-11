// Original webpack module: 83511
//
// The hub-admin command registry - handles remote/local commands with a
// "cmd" field (update, reboot, wifi scan/connect, locate, local-automation
// CRUD, Matter enable/disable, CLI passthrough, etc). Distinct from the
// LoRa device CommandRegister in lora-packet-codec.js - this one is for
// commands *about the hub itself*, arriving over mqtt-rpc.js's
// RpcServerOverMQTT (see message-dispatcher.js) or the local MQTT broker.
//
// Depends on modules: 11331 (YLAutomationRepository), 57376 (uuid), 65016
// (YLSubnetDevicesRepository), 86429 (YLSubnetInfoRepository), 31350
// (mqtt-local-broker.js's publishLocalMessage), 69113 (nmcli wifi helpers),
// 91373 (MatterApp), 75587 (YLSubnetSettingsRepository), 62984 (System, see
// system-info.js), 23712 (signalQualityToDbm), 77033 (SignSecret), 25518
// (simpleMD5), 65446 (publishRemoteMessage), 26644 (GatewayProfileRepository)

const { YLAutomationRepository } = require("./automation-repository");
const { v4: uuidv4 } = require("uuid");
const { YLSubnetDevicesRepository } = require("./yl-subnet-devices-repository"); // module 65016, not yet transcribed
const { YLSubnetInfoRepository } = require("./yl-subnet-info-repository");
const { publishLocalMessage } = require("./mqtt-local-broker");
const { getWifiList, connectWifi } = require("./nmcli-wifi"); // module 69113, not yet transcribed
const { MatterApp } = require("./matter-app");
const { YLSubnetSettingsRepository } = require("./yl-subnet-settings-repository"); // module 75587, not yet transcribed
const { System } = require("./system-info");
const { signalQualityToDbm } = require("./signal-quality"); // module 23712, not yet transcribed
const { SignSecret } = require("./sign-secret");
const { simpleMD5 } = require("./crypto-utils");
const { publishRemoteMessage } = require("./mqtt-remote-broker");
const { GatewayProfileRepository } = require("./gateway-profile-repository");

// Notifies any locally-registered automation that a device-triggered rule
// should be re-evaluated, by publishing straight back into the local broker.
function notifyAutomationRefresh(automation) {
  if (automation.type == "Device" && automation.triggerDeviceId != null) {
    let msg = {
      method: "automation.refresh",
      params: {},
      targetDevice: automation.triggerDeviceId,
    };
    publishLocalMessage(`/ys/${automation.triggerDeviceId}/tx`, Buffer.from(JSON.stringify(msg)), () => {});
  }
}

class HubCommandRegistry {
  _map = new Map();

  register(cmd, handler) {
    this._map.set(cmd, handler);
  }

  handle(jsonString, context) {
    try {
      let request = JSON.parse(jsonString);
      if (request?.cmd == null) throw new Error("cmd not found");
      return this.doHandle(request, context)
        .then((result) => Object.assign({ cmd: request.cmd, status: "ok" }, result))
        .catch((err) => (context.logger.error("Handle remote command failed", err), { cmd: request.cmd, status: "failed" }));
    } catch (e) {
      return Promise.reject("invalid json");
    }
  }

  doHandle(request, context) {
    return this._map.has(request.cmd) ? this._map.get(request.cmd)(request, context) : Promise.reject("command not found");
  }
}

const registry = new HubCommandRegistry();

registry.register("update", async (req, ctx) => {
  var url = req.url?.toString();
  var md5 = req.md5?.toString() ?? "ignore";
  if (url == null || md5 == null) throw new Error("url or md5 not found");
  var upgrade = System.upgrade(url, md5, req.reboot == 1);
  if (upgrade.getState().state == "init") upgrade.start();
  return { id: ctx.gwId, state: upgrade.getState() };
});

registry.register("hub.getUpgradeProgress", async (req, ctx) => {
  var upgrade = System.getUpgrade();
  return { id: ctx.gwId, data: upgrade?.getState() };
});

registry.register("g_gen", async (req, ctx) => {
  var info = await app.getGateway().getGwGeneralInfo();
  let other = info.other || {};
  other.comVer = info.version;
  other.netVer = app.getContext("loraServerVersion");
  other.codecVer = "0.0.1";
  other.timezone = await System.getTimezone();
  return {
    id: ctx.gwId,
    version: app.version,
    options: {},
    wifi: info.wifi,
    eth: info.eth,
    lte: info.lte,
    other: info.other,
  };
});

registry.register("s_reboot", async (req, ctx) => {
  setTimeout(() => System.reboot(), 2000);
  return { id: ctx.gwId };
});

// Kicks off an async wifi-scan + LTE-cell lookup and publishes the result
// back out-of-band as a "sys.locate" message, rather than returning it
// directly - the command ack just confirms the request was accepted.
registry.register("s_locate", async (req, ctx) => {
  (async () => {
    var wifiList = await getWifiList().catch(() => {});
    var gwInfo = await app.getGateway().getGwGeneralInfo().catch(() => {});
    var haveWifi = (wifiList?.length ?? 0) > 0;
    var haveCell = gwInfo?.lte.module?.cellId != null && gwInfo?.lte.module?.lac != null;
    if (haveWifi || haveCell) {
      var locateMsg = {
        cmd: "sys.locate",
        source: {
          cellTowers: haveCell
            ? [{
                lac: gwInfo.lte.module.lac,
                cellId: gwInfo.lte.module.cellId,
                mcc: gwInfo.lte.module.mcc,
                mnc: gwInfo.lte.module.mnc,
                signal: -gwInfo.lte.rssi,
              }]
            : undefined,
          wifiAps: haveWifi
            ? wifiList.map((ap) => ({ mac: ap.BSSID, rssi: signalQualityToDbm(ap.SIGNAL) }))
            : undefined,
        },
      };
      publishRemoteMessage(ctx, "adminReply", Buffer.from(JSON.stringify(locateMsg)));
    }
  })().catch((e) => {
    logger.info("Request locate failed", e);
  });
  return { id: ctx.gwId };
});

registry.register("s_wifi", async (req, ctx) => {
  if (req.ssid == null || req.password == null) throw new Error("ssid or password not found");
  setTimeout(() => {
    connectWifi(req.ssid, req.password).catch((e) => {
      ctx.logger.error(e, "Connect wifi failed");
    });
  }, 1000);
  return {};
});

registry.register("g_scan", async (req, ctx) => ({
  list: (await getWifiList()).map((ap) => ({ ssid: ap.SSID, rssi: signalQualityToDbm(ap.SIGNAL) })),
}));

// Stubs - accepted but not implemented on this hardware/firmware build.
registry.register("nr_check", async () => ({}));
registry.register("nr_set", async () => ({}));
registry.register("s_lte_reset", async () => ({}));
registry.register("s_battery_sm", async () => ({}));

registry.register("hub.setTimezone", async (req, ctx) => {
  await System.setTimezone(req.params.timezone);
  return { id: ctx.gwId };
});

registry.register("hub.reload", async (req, ctx) => {
  await GatewayProfileRepository.of().syncConfig();
  setTimeout(() => System.reboot(), 1000);
  return { id: ctx.gwId };
});

registry.register("hub.syncLocalData", async (req, ctx) => {
  req.params?.dataTypes.forEach((type) => {
    switch (type) {
      case "general":
        YLSubnetInfoRepository.of().syncConfig();
        break;
      case "devices":
        var subnet = app.getSubnet();
        if (subnet != null) {
          YLSubnetDevicesRepository.of()
            .syncConfig(subnet.getSubnetId(), subnet.getSubnet().familyId)
            .then(() => subnet.syncData());
        }
    }
  });
  return { id: ctx.gwId };
});

registry.register("hub.getLocalAutomations", async (req, ctx) => {
  var subnetId = app.getSubnetId();
  if (subnetId == null) return { id: ctx.gwId, data: { automations: [] } };
  let automations = await YLAutomationRepository.of(subnetId).getData();
  return { id: ctx.gwId, data: { automations } };
});

registry.register("hub.setLocalAutomation", async (req, ctx) => {
  if (req.params?.automation != null) {
    if (req.params.automation.id == null) req.params.automation.id = uuidv4();
    var subnetId = app.getSubnetId();
    if (subnetId == null) return { id: ctx.gwId, data: { automation: undefined } };
    YLAutomationRepository.of(subnetId).set(req.params.automation.id, req.params.automation);
    notifyAutomationRefresh(req.params.automation);
    return { id: ctx.gwId, data: { automation: req.params.automation } };
  }
  return { id: ctx.gwId, data: {} };
});

registry.register("hub.delLocalAutomation", async (req, ctx) => {
  if (req.params?.id != null) {
    var subnetId = app.getSubnetId();
    if (subnetId == null) return { id: ctx.gwId, data: {} };
    let automation = await YLAutomationRepository.of(subnetId).get(req.params.id);
    YLAutomationRepository.of(subnetId).del(req.params.id);
    if (automation != null) notifyAutomationRefresh(automation);
    return { id: ctx.gwId, data: {} };
  }
  return { id: ctx.gwId };
});

registry.register("hub.getMatterState", async (req, ctx) => {
  var settings = await YLSubnetSettingsRepository.of().getData();
  var running = MatterApp.of().isStarted();
  var state = running ? await MatterApp.of().rpcClient.getGeneralInfo({}) : undefined;
  return {
    id: ctx.gwId,
    data: { enable: settings?.intergrations.matter?.enable == 1, running, state }, // [sic] "intergrations"
  };
});

registry.register("hub.setMatter", async (req, ctx) => {
  if (req.params?.enable ?? 1) await MatterApp.of().enableMatter();
  else await MatterApp.of().disableMatter();
  return { id: ctx.gwId, data: {} };
});

registry.register("hub.resetMatter", async (req, ctx) => {
  await MatterApp.of().resetMatter();
  return { id: ctx.gwId, data: {} };
});

// Derives a client secret for the local API from a signed MD5 of
// subnetId+familyId - see SignSecret.signV1 / simpleMD5, not yet
// transcribed, but the shape here matches the same signing pattern used
// in hub-provisioning.js's cloud registration (MD5-based, not per-device
// negotiated).
registry.register("hub.getApiState", async (req, ctx) => {
  var subnet = app.getSubnet();
  var subnetId = subnet?.getSubnetId();
  var clientSecret = SignSecret.signV1(simpleMD5(subnetId + ":" + subnet.getSubnet().familyId));
  return {
    id: ctx.gwId,
    data: { enable: true, running: true, state: { clientId: subnetId, clientSecret } },
  };
});

// Arbitrary shell command execution, gated only by whatever transport
// authenticated this RPC call in the first place (mqtt-rpc.js /
// mqtt-local-broker.js's AUTH_TABLE).
registry.register("hub._cli", async (req, ctx) => {
  if (req.params?.command == null) throw new Error("command not found");
  return System.cli(req.params.command)
    .then((result) => ({ id: ctx.gwId, data: { code: result.code, stdout: result.stdout, stderr: result.stderr } }))
    .catch((err) => ({ id: ctx.gwId, data: { error: err } }));
});

module.exports = {
  handleCommand: (jsonString, context) => registry.handle(jsonString, context).then((result) => JSON.stringify(result)),
};
