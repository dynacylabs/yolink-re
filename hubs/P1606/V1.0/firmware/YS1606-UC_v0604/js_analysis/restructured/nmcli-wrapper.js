// Original webpack module: 5406
//
// Thin wrapper around Linux's `nmcli` (NetworkManager CLI), spawned as a
// child process for every call. Two output modes: `cli()` returns raw
// stdout/stderr text (for simple on/off/set commands), `clib()` parses
// nmcli's `-m multiline` key:value output into an array of objects (for
// list/show commands). This is what backs the wifi scan/connect and
// eth/gsm connection-profile logic exposed via hub-remote-commands.js.

const os = require("os");
const { spawn } = require("child_process");

function getIPv4() {
  return new Promise((resolve, reject) => {
    try {
      const interfaces = os.networkInterfaces();
      let result = [];
      for (const name in interfaces) {
        if (Object.hasOwnProperty.call(interfaces, name)) {
          const addrs = interfaces[name];
          for (const addr of addrs) {
            if (!addr.internal && addr.family === "IPv4") {
              result.push({ address: addr.address, netmask: addr.netmask, mac: addr.mac });
            }
          }
        }
      }
      resolve(result);
    } catch (e) {
      reject(e);
    }
  });
}

// Parses nmcli's `-m multiline` output (repeating blocks of `KEY: value`
// lines, one block per record) into an array of {key: value} objects.
// Detects record boundaries by watching for the first key to repeat.
function parseMultiline(buffer) {
  const lines = buffer.toString().split("\n").map((line) => {
    const colonIdx = line.indexOf(":");
    const entry = {};
    entry[line.slice(0, colonIdx)] = line.slice(colonIdx + 1).replace(/^ */, "");
    return entry;
  });
  const firstKey = Object.keys(lines[0])[0];
  let recordLength = 1;
  for (recordLength = 1; recordLength < lines.length && Object.keys(lines[recordLength])[0] !== firstKey; recordLength++);
  let records = [];
  for (let i = 0; i < lines.length; i += recordLength) {
    let record = {};
    lines.slice(i, i + recordLength).forEach((line) => {
      const key = Object.keys(line)[0];
      if (key) record[key] = line[key];
    });
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}

// Fire-and-forget style: spawns nmcli, resolves with the first stdout
// chunk as a trimmed string (or rejects with the first stderr chunk / a
// non-zero close code).
function cli(args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      const proc = spawn("nmcli", args);
      proc.stdout.on("data", (data) => {
        if (!settled) { settled = true; resolve(data.toString().trim()); }
      });
      proc.stderr.on("data", (data) => {
        if (!settled) { settled = true; reject(data.toString().trim()); }
      });
      proc.on("close", (code) => {
        if (!settled) { settled = true; resolve(code); }
      });
    } catch (e) {
      if (!settled) { settled = true; reject(e); }
    }
  });
}

// Buffered variant: accumulates all stdout, then parses it as
// `-m multiline` records on close.
function clib(args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      const proc = spawn("nmcli", args);
      const chunks = [];
      proc.stdout.on("data", (data) => chunks.push(data));
      proc.stderr.on("data", (data) => {
        if (!settled) { settled = true; reject(data.toString()); }
      });
      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          try {
            if (code !== 0) return reject(code);
            resolve(parseMultiline(chunks.join("")));
          } catch (e) {
            reject(e);
          }
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function activityMonitor(sink) {
  return new Promise((resolve, reject) => {
    try {
      const proc = spawn("nmcli", ["monitor"]);
      function stop() {
        proc.kill("SIGHUP");
      }
      proc.stdout.pipe(sink, { end: false });
      resolve(stop);
    } catch (e) {
      reject(e);
    }
  });
}

const getHostName = () => cli(["general", "hostname"]);
const setHostName = (name) => cli(["general", "hostname", String(name)]);
const enable = () => cli(["networking", "on"]);
const disable = () => cli(["networking", "off"]);
const getNetworkConnectivityState = (check = false) =>
  cli(check ? ["networking", "connectivity", "check"] : ["networking", "connectivity"]);
const connectionUp = (name) => cli(["connection", "up", String(name)]);
const connectionDown = (name) => cli(["connection", "down", String(name)]);
const connectionDelete = (name) => cli(["connection", "delete", String(name)]);
const getConnectionProfilesList = (activeOnly = false) =>
  clib(activeOnly
    ? ["-m", "multiline", "connection", "show", "--active", "--order", "active:name"]
    : ["-m", "multiline", "connection", "show", "--order", "active:name"]);
const changeDnsConnection = (name, dns) => cli(["connection", "modify", String(name), "ipv4.dns", String(dns)]);
const addEthernetConnection = (name, ifname = "enp0s3", address, gateway) =>
  cli(["connection", "add", "type", "ethernet", "con-name", name, "ifname", ifname, "ipv4.method", "manual", "ipv4.addresses", `${address}/24`, "gw4", gateway]);
const addGsmConnection = (name, ifname = "*", apn, username, password, pin) => {
  let args = ["connection", "add", "type", "gsm", "con-name", name, "ifname", ifname];
  if (apn) args.push("apn", String(apn));
  if (username) args.push("username", String(username));
  if (password) args.push("password", String(password));
  if (pin) args.push("pin", String(pin));
  return cli(args);
};
const deviceConnect = (device) => cli(["device", "connect", String(device)]);
const deviceDisconnect = (device) => cli(["device", "disconnect", String(device)]);

const IP_DEVICE_STATE = { 10: "unmanaged", 30: "disconnected", 100: "connected" };

const deviceStatus = async () => {
  const rows = await clib(["device", "status"]);
  return Object.keys(rows[0])
    .map((key) => {
      if (key.startsWith("DEVICE")) return null;
      const fields = key.replaceAll(/\s{2,}/g, " ").trim().split(" ");
      const entry = {};
      entry.device = fields.shift();
      entry.type = fields.shift();
      entry.state = fields.shift();
      entry.connection = fields.join(" ");
      return entry;
    })
    .filter((entry) => !!entry);
};

const getDeviceInfoIPDetail = async (device) => {
  const rows = await clib(["device", "show", String(device)]);
  return rows.map((row) => {
    const state = parseInt(row["GENERAL.STATE"]) || 10;
    return {
      device: row["GENERAL.DEVICE"],
      type: row["GENERAL.TYPE"],
      state: IP_DEVICE_STATE[state],
      connection: row["GENERAL.CONNECTION"],
      mac: row["GENERAL.HWADDR"],
      ipV4: row["IP4.ADDRESS[1]"]?.replace(/\/[0-9]{2}/g, ""),
      netV4: row["IP4.ADDRESS[1]"],
      gatewayV4: row["IP4.GATEWAY"],
      ipV6: row["IP6.ADDRESS[1]"]?.replace(/\/[0-9]{2}/g, ""),
      netV6: row["IP6.ADDRESS[1]"],
      gatewayV6: row["IP6.GATEWAY"],
    };
  })[0];
};

const getAllDeviceInfoIPDetail = async () => {
  const rows = await clib(["device", "show"]);
  return rows.map((row) => {
    const state = parseInt(row["GENERAL.STATE"]) || 10;
    return {
      device: row["GENERAL.DEVICE"],
      type: row["GENERAL.TYPE"],
      state: IP_DEVICE_STATE[state],
      connection: row["GENERAL.CONNECTION"],
      mac: row["GENERAL.HWADDR"],
      ipV4: row["IP4.ADDRESS[1]"]?.replace(/\/[0-9]{2}/g, ""),
      netV4: row["IP4.ADDRESS[1]"],
      gatewayV4: row["IP4.GATEWAY"],
      ipV6: row["IP6.ADDRESS[1]"]?.replace(/\/[0-9]{2}/g, ""),
      netV6: row["IP6.ADDRESS[1]"],
      gatewayV6: row["IP6.GATEWAY"],
    };
  });
};

const wifiEnable = () => cli(["radio", "wifi", "on"]);
const wifiDisable = () => cli(["radio", "wifi", "off"]);
const getWifiStatus = () => cli(["radio", "wifi"]);
const wifiHotspot = async (ifname, ssid, password) =>
  clib(["device", "wifi", "hotspot", "ifname", String(ifname), "ssid", ssid, "password", password]);
const wifiCredentials = async (ifname) => {
  if (!ifname) throw Error("ifname required!");
  return (await clib(["device", "wifi", "show-password", "ifname", ifname]))[0];
};
const getWifiList = async (rescan = false) =>
  (await clib(rescan
    ? ["-m", "multiline", "device", "wifi", "list", "--rescan", "yes"]
    : ["-m", "multiline", "device", "wifi", "list", "--rescan", "no"]))
    .map((ap) => {
      let entry = Object.assign({}, ap);
      entry.inUseBoolean = entry["IN-USE"] === "*";
      return entry;
    });
const wifiConnect = (ssid, password, hidden = false) =>
  cli(hidden
    ? ["device", "wifi", "connect", String(ssid), "password", String(password), "hidden", "yes"]
    : ["device", "wifi", "connect", String(ssid), "password", String(password)]);

module.exports = {
  getIPv4,
  cli,
  clib,
  activityMonitor,
  getHostName,
  setHostName,
  enable,
  disable,
  getNetworkConnectivityState,
  connectionUp,
  connectionDown,
  connectionDelete,
  getConnectionProfilesList,
  changeDnsConnection,
  addEthernetConnection,
  addGsmConnection,
  deviceConnect,
  deviceDisconnect,
  deviceStatus,
  getDeviceInfoIPDetail,
  getAllDeviceInfoIPDetail,
  wifiEnable,
  wifiDisable,
  getWifiStatus,
  wifiHotspot,
  wifiCredentials,
  getWifiList,
  wifiConnect,
};
