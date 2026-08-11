// Original webpack module: 62984
//
// Thin wrapper around a handful of shell commands for hardware identity
// and system control. getHWId() is the value that feeds hub-provisioning.js's
// registerHub() - it's an MD5 hash derived from the CPU serial and eMMC
// CID, not a value burned in at the factory or read from a secure element.

const { cli } = require("./shell-exec"); // original module 67043
const { UpgradeTask } = require("./upgrade-task"); // original module 88196
const { simpleMD5 } = require("./crypto-utils");

class System {
  static #tz;
  static #cpuId;
  static #storageId;
  static #hwId;

  static cli(command) {
    return cli(command);
  }

  static async getCpuid() {
    if (System.#cpuId != null) return System.#cpuId;
    const result = await cli("cat /proc/cpuinfo | grep Serial");
    if (!result.stdout?.length) {
      System.#cpuId = "0000000000000000";
    } else {
      System.#cpuId = result.stdout.split(":")[1].trim();
    }
    return System.#cpuId;
  }

  static async getStorageId() {
    if (System.#storageId != null) return System.#storageId;
    const result = await cli("cat /sys/block/mmcblk0/device/cid");
    System.#storageId = result.stdout?.length ? result.stdout.trim() : "00000000-0000-0000-0000-000000000000";
    return System.#storageId;
  }

  // The hub's "hardware id" - not read from any secure/immutable
  // storage, just derived from two Linux-visible identifiers (CPU serial,
  // eMMC CID) via MD5. See hub-provisioning.js's registerHub() for where
  // this feeds into cloud registration.
  static async getHWId() {
    if (System.#hwId != null) return System.#hwId;
    const cpuId = await System.getCpuid();
    const storageId = await System.getStorageId();
    System.#hwId = simpleMD5(cpuId).substring(0, 16) + simpleMD5(storageId).substring(16);
    return System.#hwId;
  }

  static async getTimezone() {
    if (System.#tz != null) return System.#tz;
    const result = (await cli("cat /etc/timezone")).stdout?.trim();
    if (!result?.length) throw new Error("no tz found");
    System.#tz = result;
    return System.#tz;
  }

  static async setTimezone(tzName) {
    const matches = (await cli("timedatectl list-timezones | grep " + tzName)).stdout?.split("\n");
    if (matches.length !== 1) throw new Error("Invalid TZ:" + tzName);
    const result = await cli("timedatectl set-timezone " + matches[0]);
    if (result.code === 0) {
      System.#tz = matches[0];
      return true;
    }
  }

  static reboot() {
    return cli("reboot");
  }

  static upgrade(url, version, options) {
    return UpgradeTask.of(url, version, options);
  }

  static getUpgrade() {
    return UpgradeTask.current();
  }
}

module.exports = { System };
