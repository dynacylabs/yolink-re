// Original webpack module: 17729
//
// Drives the hub's status LEDs through Linux's standard sysfs LED class
// interface (/sys/class/leds/<name>/{brightness,trigger}) - no special
// driver needed, just plain file writes. See hub-provisioning.js for how
// this gets used (net_led / lte_led / stat_g_led / stat_r_led).

const fs = require("fs");
const ledInstances = new Map();

class GpioLed {
  name;
  brightness;
  trigger;

  constructor(name) {
    this.name = name;
  }

  setOnOff(on) {
    if (this.trigger !== "none") {
      this.trigger = "none";
      this.write("trigger", "none");
    }
    const brightness = on ? 255 : 0;
    if (brightness !== this.brightness) {
      this.brightness = brightness;
      this.write("brightness", brightness.toString());
    }
  }

  setHeatbeat(enable = true) { // [sic] "Heatbeat" - typo in original
    if (enable) {
      if (this.trigger !== "heartbeat") { this.trigger = "heartbeat"; this.write("trigger", "heartbeat"); }
    } else if (this.trigger === "heartbeat") {
      this.trigger = "none";
      this.write("trigger", "none");
    }
    this.brightness = -1;
  }

  setTimer(enable = true) {
    if (enable) {
      if (this.trigger !== "timer") { this.trigger = "timer"; this.write("trigger", "timer"); }
    } else if (this.trigger === "timer") {
      this.trigger = "none";
      this.write("trigger", "none");
    }
    this.brightness = -1;
  }

  write(attribute, value) {
    console.log(`Write file ${this.name}/${attribute} with value ${value}`);
    fs.writeFileSync(`/sys/class/leds/${this.name}/${attribute}`, value);
  }

  static of(name) {
    let led = ledInstances.get(name);
    if (led == null) {
      led = new GpioLed(name);
      ledInstances.set(name, led);
    }
    return led;
  }
}

function getGpioLed(name) {
  return GpioLed.of(name);
}

module.exports = { getGpioLed, GpioLed };
