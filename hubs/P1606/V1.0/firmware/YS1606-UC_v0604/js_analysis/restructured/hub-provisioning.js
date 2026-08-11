// Original webpack modules: 37309 (checkEnv/checkStatus - the --loop status
// LED driver), 56366 (registerHub/fetchGatewayConfiguration - cloud
// registration), 26644 (GatewayProfileRepository), 50964
// (loadConfiguraiton [sic])
//
// This is the hub's first-boot provisioning flow: if it doesn't already
// have a gwId/gwSecret (persisted in /etc/environment), it registers
// itself with YoLink's cloud using its hardware ID, saves the returned
// credentials, and reboots. This is the part of the app most directly
// relevant to the "onboarding" security questions this whole project has
// been circling - see the README for what was and wasn't verified here.

const { simpleMD5 } = require("./crypto-utils"); // original module 25518
const jwt = require("jsonwebtoken"); // original module 49704 - this IS the real npm `jsonwebtoken` package
const fs = require("fs");
const { getGpioLed } = require("./gpio-leds"); // original module 17729
const { waitForTask } = require("./delay-utils"); // original module 9144
const { System } = require("./system-info"); // original module 62984
const { GatewayProfileRepository } = require("./gateway-profile-repository");

const REGISTRATION_MODEL = "1606";
const YOLINK_DEVICE_ID_PREFIX = "d88b4c";
const HMAC_ISSUER = "YoSmart";
const API_BASE_URL = "https://us.yosmart.com";

// ---------------- Cloud registration (original module 56366) ----------------

async function fetchGatewayConfiguration(gwId, gwSecret) {
  const response = await fetch(`${API_BASE_URL}/pf/${gwId}/${gwSecret}`).then((r) => r.json());
  if (response?.code === "000000" && response?.data != null) return response.data;
  throw new Error("Invalid response");
}

// Signs a JWT over the hub's hardware ID and posts it to /dar/registerHub
// to obtain a gwId/gwSecret pair for a brand-new hub. The "secret" used to
// sign the JWT is itself derived (MD5) from a fixed string built from the
// device-id prefix, model number, and issuer name - i.e. it's not a
// per-device secret negotiated with the server beforehand, it's
// computable by anyone who knows the scheme. See the README for what this
// means and what wasn't checked.
async function registerHub(hardwareId) {
  const subject = `appId/${YOLINK_DEVICE_ID_PREFIX}${REGISTRATION_MODEL}000000`;
  const signingKey = simpleMD5(`ys.${HMAC_ISSUER}.${subject}`).toLocaleLowerCase();
  const token = jwt.sign({ jti: hardwareId, sub: subject, iss: HMAC_ISSUER }, signingKey);

  const response = await fetch(`${API_BASE_URL}/dar/registerHub`, {
    method: "POST",
    body: JSON.stringify({ hwToken: token }),
    headers: { "Content-Type": "application/json" },
  }).then((r) => r.json());

  if (response.code === "000000" && response.data?.deviceId) return response.data;
  throw new Error("Invalid response:" + response.code + ":" + response.descrition); // [sic] "descrition"
}

// ---------------- First-boot provisioning (original module 37309, checkEnv) ----------------

// Runs once at every "--loop" startup. If gwId/gwSecret aren't already in
// /etc/environment, drives the LEDs into a "registering" pattern, calls
// registerHub() (retrying up to 5 times, 10s apart), writes the result
// into /etc/environment (preserving any other existing keys), and
// reboots the hub so the new env vars take effect.
async function checkEnv() {
  if (process.env.gwId != null && process.env.gwSecret != null) return true;

  const envFileContents = fs.readFileSync("/etc/environment").toString();
  const alreadyProvisioned = /gwId=[\w]+/gi.test(envFileContents) && /gwSecret=[\w]+/gi.test(envFileContents);
  if (alreadyProvisioned) return true;

  logger.warn("gwId or gwSecret not found in env");
  try {
    getGpioLed("net_led").setTimer();
    getGpioLed("lte_led").setTimer();
    getGpioLed("stat_g_led").setTimer();
    getGpioLed("stat_r_led").setOnOff(false);

    const hardwareId = await System.getHWId();
    const registration = await waitForTask(5, () => registerHub(hardwareId), { interval: 10000 });

    writeEnvFile(envFileContents, { gwId: registration.deviceId, gwSecret: registration.deviceSecret });
    System.reboot();
  } catch (err) {
    logger.error("register hub failed,error:", err);
    getGpioLed("net_led").setOnOff(false);
    getGpioLed("lte_led").setOnOff(false);
    getGpioLed("stat_g_led").setOnOff(false);
    getGpioLed("stat_r_led").setOnOff(true);
    return false;
  }
  return true;
}

// Merges `updates` into the existing /etc/environment text, replacing any
// KEY=value lines that already exist and appending the rest.
function writeEnvFile(existingContents, updates) {
  let rebuilt = "";
  existingContents.split("\n").forEach((line) => {
    if (/\w[+]=/.test(line)) {
      const key = line.split("=")[0];
      if (updates[key] != null) {
        rebuilt += `${key}=${updates[key]}\n`;
        delete updates[key];
      } else {
        rebuilt += line + "\n";
      }
    } else {
      rebuilt += line + "\n";
    }
  });
  for (const key in updates) rebuilt += `${key}=${updates[key]}\n`;
  fs.writeFileSync("/etc/environment", rebuilt);
}

// ---------------- Status-LED loop (original module 37309, checkStatus) ----------------
// Polls this same process's own local status endpoint once a second (see
// status-loop.js's startLoop(), run via `--loop`) and drives four
// GPIO-backed LEDs (net/lte/stat_g/stat_r) to reflect ATE mode, firmware
// download/install progress, error state, and network/LTE connectivity.
// Hits http://127.0.0.1:1080/_internal/status - internal-diagnostics-api.js's
// own /status route, confirming the HTTP server really does run on port
// 1080 (see task-registrations/start-http-mqtt.js).

// `bootTime` is captured once, at module load. `hasSettledState` starts
// false and latches permanently true either once the status endpoint
// reports no error, or once 30 seconds have passed since boot - after
// that point the stat LEDs show a steady on/off state instead of
// blinking, i.e. the blink pattern is specifically a "still starting up"
// signal for the first 30 seconds, not a general error indicator.
const bootTime = new Date();
let hasSettledState = false;

function checkStatus() {
  return fetchStatusJSON().then(applyStatusLEDs).catch(handleStatusFetchError);
}

function fetchStatusJSON() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 800);
  return fetch("http://127.0.0.1:1080/_internal/status", { signal: controller.signal })
    .then((res) => res.json())
    .finally(() => clearTimeout(timeoutId));
}

function applyStatusLEDs(status) {
  if (status.isInAteMode) {
    getGpioLed("net_led").setTimer();
    getGpioLed("lte_led").setTimer();
    getGpioLed("stat_g_led").setTimer();
    setTimeout(() => getGpioLed("stat_r_led").setTimer(), 300);
    return;
  }

  if (status.upgradingState == "download") {
    getGpioLed("stat_g_led").setTimer();
    getGpioLed("stat_r_led").setOnOff(false);
  } else if (status.upgradingState == "install") {
    getGpioLed("stat_g_led").setOnOff(false);
    getGpioLed("stat_r_led").setTimer();
  } else {
    if (status.error == 0 || new Date().getTime() - bootTime.getTime() > 30000) hasSettledState = true;
    if (hasSettledState) {
      getGpioLed("stat_g_led").setOnOff(status.error == 0);
      getGpioLed("stat_r_led").setOnOff(status.error == 1);
    } else {
      getGpioLed("stat_g_led").setTimer();
      getGpioLed("stat_r_led").setOnOff(false);
    }
  }

  getGpioLed("lte_led").setOnOff(status.lte);
  if (status.isInApOperator) getGpioLed("net_led").setTimer();
  else getGpioLed("net_led").setOnOff(status.network);
}

function handleStatusFetchError(err) {
  if (!hasSettledState && new Date().getTime() - bootTime.getTime() > 30000) hasSettledState = true;
  getGpioLed("net_led").setOnOff(false);
  getGpioLed("lte_led").setOnOff(false);
  if (hasSettledState) {
    getGpioLed("stat_g_led").setOnOff(false);
    getGpioLed("stat_r_led").setTimer();
  } else {
    getGpioLed("stat_g_led").setTimer();
    getGpioLed("stat_r_led").setOnOff(false);
  }
}

module.exports = {
  fetchGatewayConfiguration,
  registerHub,
  checkEnv,
  checkStatus,
  GatewayProfileRepository,
};
