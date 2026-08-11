// Original webpack module: 37476
//
// Client for YoLink's cloud-side "local control subnet" (LCSubnet) API -
// the `/lcsubnet/dpf/...` namespace also seen exposed *by* this hub's own
// Express server (see http-server.js) suggests this is a symmetric
// protocol: the hub calls up to the cloud with these same paths to fetch
// its subnet config/device list, using its gwId/gwSecret as auth.

const { getGatewayBaseConfig, getGeneralConfig } = require("./config");

async function callLCSubnetAPI(path, extraParams) {
  const { gwId, gwSecret } = getGatewayBaseConfig();
  const params = extraParams ?? {};
  params.deviceId = gwId;
  params.token = gwSecret;

  let url = getGeneralConfig().apiBaseUrl + path + "?";
  for (const key in params) url += `${key}=${params[key]}&`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json());

  if (response.code === "000000") return response;
  throw new Error(`${response.code}:${response.descrition}`); // [sic] "descrition"
}

function getSubnetInfo() {
  return callLCSubnetAPI("/lcsubnet/dpf/info").then((response) => response.data?.subnet);
}

function getSubnetDevices(subnetId, familyId) {
  return callLCSubnetAPI("/lcsubnet/dpf/devices", { subnetId, familyId }).then((response) => response.data?.devices);
}

module.exports = { getSubnetInfo, getSubnetDevices };
