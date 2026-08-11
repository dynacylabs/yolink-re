// Original webpack module: 88196
//
// Firmware/OTA update task, invoked by hub-remote-commands.js's "update"
// command (System.upgrade(url, md5, reboot)). Downloads an arbitrary URL
// to /tmp/ota.bin, verifies its MD5 against the caller-supplied value
// (UNLESS that value is the literal string "ignore", which skips
// verification entirely), untars it, then installs every *.deb via dpkg
// and runs every *.sh as a shell script.
//
// FINDING: no cryptographic signature check anywhere in this path - only
// an optional, caller-suppliable MD5. Whoever can reach hub._cli or the
// "update" RPC command (see hub-remote-commands.js - gated only by
// mqtt-local-broker.js's AUTH_TABLE / mqtt-rpc.js's transport auth) can
// have the hub download and dpkg-install arbitrary .deb packages, or
// execute an arbitrary bash script, from any URL, with the MD5 check
// trivially bypassed via md5:"ignore".

const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { cli } = require("./shell-exec"); // original module 67043
const { System } = require("./system-info");
const { spawn } = require("child_process");

const OTA_ARCHIVE_PATH = "/tmp/ota.bin";
const OTA_EXTRACT_DIR = "/tmp/ota";

class UpgradeTask {
  static #instance;
  url;
  md5;
  reboot;
  state;
  downloadProgress;
  installProgress;

  constructor(url, md5, reboot) {
    this.url = url;
    this.md5 = md5;
    this.reboot = reboot;
    this.state = "init";
    this.downloadProgress = { current: 0, total: 0 };
    this.installProgress = { success: 0, total: 0 };
  }

  start() {
    if (this.state != "init") return;
    this.state = "download";
    this.before();
    (async () => {
      if (await this.download()) {
        this.state = "install";
        await this.upgrade();
      }
    })()
      .then(() => {
        logger.info("upgrade success");
        if (this.reboot) setTimeout(() => System.reboot(), 2000);
      })
      .catch((err) => {
        logger.error("Upgrade failed: ", err);
      })
      .finally(() => {
        this.state = "done";
        this.after();
      });
  }

  download() {
    const hash = crypto.createHash("md5");
    return new Promise((resolve, reject) => {
      http
        .get(this.url, (response) => {
          if (response.statusCode != 200 && response.statusCode != 201) {
            reject("download failed");
            return;
          }
          if (response.headers["content-length"] != null) {
            this.downloadProgress.total = parseInt(response.headers["content-length"]);
          }
          const file = fs.createWriteStream(OTA_ARCHIVE_PATH);
          response.pipe(file);
          response.on("data", (chunk) => {
            this.downloadProgress.current += chunk.length;
            hash.update(chunk);
          });
          file.on("finish", () => {
            file.close();
            if (hash.digest("hex").toLocaleLowerCase() == this.md5.toLocaleLowerCase() || this.md5 == "ignore") {
              resolve(true);
            } else {
              reject(new Error("MD5 Not match"));
            }
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async upgrade() {
    if ((await cli(`tar -zxvf ${OTA_ARCHIVE_PATH} -C ${OTA_EXTRACT_DIR}`)).code != 0) {
      throw new Error("uncompress ota file failed");
    }
    const files = fs.readdirSync(OTA_EXTRACT_DIR);
    for (var file of files) {
      if (file.endsWith(".deb")) await this.installDeb(`${OTA_EXTRACT_DIR}/${file}`);
      else if (file.endsWith(".sh")) await this.executeShell(`${OTA_EXTRACT_DIR}/${file}`); // [sic] original: "execultShell"
      this.installProgress.success++;
    }
  }

  spawn(command, args) {
    return new Promise((resolve, reject) => {
      var proc = spawn(command, args);
      const log = fs.createWriteStream("/tmp/update.log");
      proc.stdout.pipe(log);
      proc.stderr.pipe(log);
      proc.on("close", (code) => {
        log.close();
        if (code == 0) resolve();
        else reject(new Error("command failed"));
      });
    });
  }

  installDeb(path) {
    return this.spawn("dpkg", ["-i", path]);
  }

  executeShell(path) {
    return this.spawn("/bin/bash", [path]);
  }

  before() {
    if (fs.existsSync(OTA_ARCHIVE_PATH)) fs.rmSync(OTA_ARCHIVE_PATH);
    if (fs.existsSync(OTA_EXTRACT_DIR)) fs.rmdirSync(OTA_EXTRACT_DIR, { recursive: true });
    fs.mkdirSync(OTA_EXTRACT_DIR);
  }

  after() {
    if (fs.existsSync(OTA_ARCHIVE_PATH)) fs.rmSync(OTA_ARCHIVE_PATH);
    if (fs.existsSync(OTA_EXTRACT_DIR)) fs.rmdirSync(OTA_EXTRACT_DIR, { recursive: true });
  }

  getState() {
    return { state: this.state, downloadProgress: this.downloadProgress, installProgress: this.installProgress };
  }

  static current() {
    return UpgradeTask.#instance;
  }

  static of(url, md5, reboot) {
    if (UpgradeTask.#instance == null || UpgradeTask.#instance.state == "done") {
      UpgradeTask.#instance = new UpgradeTask(url, md5, reboot);
    }
    return UpgradeTask.#instance;
  }
}

module.exports = { UpgradeTask };
