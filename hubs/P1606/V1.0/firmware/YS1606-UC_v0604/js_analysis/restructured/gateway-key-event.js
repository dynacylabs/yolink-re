// Original webpack module: 56359
//
// Physical button (reset/AP-mode) long-press state machine, driven by
// key events from the LoRa radio module (lora-transport.js's LoraClient
// setOnKeyEvent - event 0 = pressed, non-zero = released). Ticks every
// 100ms while held:
//   - held 500ms or less on release: "Tap" - stops AP mode if running.
//   - held 5s-10s: enters AP mode (wifi hotspot broadcast, net_led blink,
//     auto-reverts after 5 minutes via apTimer).
//   - held 20s-25s (on release, not on hold): logged as "Reset" but no
//     actual reset action is taken here - [sic] likely intentional (real
//     factory-reset trigger lives elsewhere) or dead/leftover code.
//   - held >30s while still down: auto-destroys the press tracker.

const { getGpioLed } = require("./gpio-leds");
const { wifiStartHotspot, wifiStopHotspot } = require("./network-status");
const { LoraClient } = require("./lora-transport");

const gatewayLocalState = {
  operationHelpers: [],
  apEnabled: false,
};

class KeyPressTracker {
  pressed;
  timer;

  constructor() {
    this.pressed = 0;
    this.timer = setInterval(() => {
      let previous = this.pressed;
      this.pressed += 100;
      this.tick(previous);
    }, 100);
  }

  tick(previousMs) {
    if (previousMs < 5000 && this.pressed >= 5000) {
      gatewayLocalState.operationHelpers.push("ap");
      getGpioLed("net_led").setTimer();
    } else if (previousMs < 10000 && this.pressed >= 10000) {
      getGpioLed("net_led").setTimer(false);
      gatewayLocalState.operationHelpers = gatewayLocalState.operationHelpers.filter((h) => h != "ap");
    }
    if (this.pressed > 30000) this.destroy();
  }

  unpress() {
    gatewayLocalState.operationHelpers = gatewayLocalState.operationHelpers.filter((h) => h != "ap");
    if (this.pressed <= 500) {
      console.log("Tap");
      stopApMode();
    } else if (this.pressed >= 5000 && this.pressed < 10000) {
      console.log("AP Mode");
      LoraClient.of().broadcastId();
      if (gatewayLocalState.apTimer != null) clearTimeout(gatewayLocalState.apTimer);
      getGpioLed("net_led").setTimer();
      wifiStartHotspot();
      gatewayLocalState.apEnabled = true;
      gatewayLocalState.apTimer = setTimeout(() => {
        stopApMode();
      }, 300000);
    } else if (this.pressed > 20000 && this.pressed < 25000) {
      console.log("Reset"); // [sic] - logged only, no reset action taken here
    }
    this.destroy();
  }

  destroy() {
    clearInterval(this.timer);
  }
}

function stopApMode() {
  if (gatewayLocalState.apTimer != null) clearTimeout(gatewayLocalState.apTimer);
  getGpioLed("net_led").setTimer(false);
  wifiStopHotspot();
  gatewayLocalState.apEnabled = false;
  gatewayLocalState.apTimer = undefined;
}

function bindGatewayKeyEvent(gateway) {
  var tracker = undefined;
  gateway.loraClient.setOnKeyEvent((event) => {
    if (event.event == 0) {
      // pressed
      if (tracker != null) tracker.destroy();
      tracker = new KeyPressTracker();
    } else {
      // released
      if (tracker != null) {
        tracker.unpress();
        tracker = undefined;
      }
    }
  });
}

function getGatewayLocalState() {
  return { operationHelpers: gatewayLocalState.operationHelpers, apEnabled: gatewayLocalState.apEnabled };
}

function gatewayStopApMode() {
  stopApMode();
}

module.exports = { bindGatewayKeyEvent, getGatewayLocalState, gatewayStopApMode };
