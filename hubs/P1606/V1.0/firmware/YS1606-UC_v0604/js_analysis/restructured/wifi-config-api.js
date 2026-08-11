// Original webpack module: 34121
//
// A THIRD LAN-facing HTTP surface, distinct from internal-diagnostics-api.js
// (/_internal) and open-api-routes.js (/open/yolink) - mounted at
// /api/v1, gated by the same hostname allowlist pattern
// (192.168.*/127.0.0.1/localhost), no auth token. Provides network
// status and wifi station configuration - presumably what a companion
// setup app talks to over the AP-mode hotspot during initial hub
// provisioning (see gateway-key-event.js's AP-mode trigger).

const { Router, json } = require("express");
const { getNetDevDetails, getNetworkConnectivity, getWifiList, connectWifi } = require("./network-status");
const { signalQualityToDbm } = require("./signal-quality");

const router = Router();

router.use((req, res, next) => {
  if (req.hostname.startsWith("192.168") || req.hostname.startsWith("127.0.0.1") || req.hostname.startsWith("localhost")) next();
  else res.status(403).send("Forbidden");
});

router.use(json());

router.get("/network/state", async (req, res) => {
  try {
    var wlan = await getNetDevDetails("wlan0");
    var connectivity = await getNetworkConnectivity();
    res.json({ code: "000000", data: { wifi: { ssid: wlan.connection, ip: wlan.ipV4 }, internet: connectivity == "full" } });
  } catch (e) {
    console.log(e);
    res.json({ code: "999999" });
  }
});

router.get("/wifi/scan", (req, res) => {
  getWifiList()
    .then((list) => {
      res.json({ code: "000000", data: list.map((ap) => ({ ssid: ap.SSID, rssi: signalQualityToDbm(ap.SIGNAL) })) });
    })
    .catch(() => {
      res.json({ code: "999999" });
    });
});

router.post("/wifi/sta", (req, res) => {
  connectWifi(req.body.ssid, req.body.pwd)
    .then(() => {
      res.json({ code: "000000" });
    })
    .catch((e) => {
      console.log(e);
      res.json({ code: "999999" });
    });
});

router.post("/wifi/config/exit", (req, res) => {
  app.getGateway().stopApMode();
  res.json({ code: "000000" });
});

function attachExpress(expressApp) {
  expressApp.use("/api/v1", router);
}

module.exports = { attachExpress };
