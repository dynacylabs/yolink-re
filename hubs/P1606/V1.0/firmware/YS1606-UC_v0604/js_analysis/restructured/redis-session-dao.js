// Original webpack module: 52548 (YoLinkDeviceSessionDao)
//
// Persists DeviceSession JSON blobs to Redis (see config.js's
// getRedisConfig - db 9 by default), plus tracks which devices belong to
// which "YoLink family" (their term for a shared household/account
// grouping - a device can only belong to one family, enforced via the
// `ds:family:device:<id>` -> familyId lookup plus a `ds:family:<id>` Redis
// set for membership).

const { createClient } = require("./redis-client"); // original module 25693 - a thin wrapper around the real `redis` npm package
const { getRedisConfig } = require("./config");

class YoLinkDeviceSessionDao {
  static #singleton;
  #redisClient;

  constructor() {
    const { host, password, db } = getRedisConfig();
    this.#redisClient = createClient({ url: `redis://${host}`, password, database: db });
    this.#redisClient.on("error", (err) => logger.error(err, "Redis connection error"));
    this.#redisClient.connect();
  }

  saveDeviceSession(deviceId, json) {
    return this.#redisClient.set(`ds:${deviceId}`, JSON.stringify(json)).then(() => true);
  }

  loadDeviceSession(deviceId) {
    return new Promise((resolve, reject) => {
      this.#redisClient
        .get(`ds:${deviceId}`)
        .then((raw) => resolve(raw == null ? undefined : JSON.parse(raw)))
        .catch(reject);
    });
  }

  // Only returns the family id if this device is still actually a member
  // of that family's set - i.e. the fast per-device pointer is treated as
  // a hint, not a source of truth.
  async getCurrentYoLinkFamily(deviceId) {
    const familyId = await this.#redisClient.get(`ds:family:device:${deviceId}`);
    if (familyId != null) {
      const stillMember = await this.#redisClient.sIsMember(`ds:family:${familyId}`, deviceId);
      return stillMember ? familyId : undefined;
    }
  }

  // Bulk-updates family membership for a list of devices in one Redis
  // pipeline: optionally clears the family's existing member set first
  // (`replaceAll`), adds all the new devices to it, and updates each
  // device's own family pointer.
  saveYoLinkFamilyDevice(familyId, deviceIds, replaceAll) {
    const multi = this.#redisClient.multi();
    const devicePointerPairs = [];
    deviceIds.forEach((deviceId) => {
      devicePointerPairs.push(`ds:family:device:${deviceId}`);
      devicePointerPairs.push(familyId);
    });
    if (replaceAll === 1) multi.del(`ds:family:${familyId}`);
    multi.sAdd(`ds:family:${familyId}`, deviceIds);
    multi.mSet(devicePointerPairs);
    return multi.execAsPipeline().then(() => {});
  }

  getCurrentFamilyDevices(familyId) {
    return this.#redisClient.sMembers(`ds:family:${familyId}`).then((members) => ((members?.length ?? 0) > 0 ? members : []));
  }

  static getInstance() {
    if (YoLinkDeviceSessionDao.#singleton == null) YoLinkDeviceSessionDao.#singleton = new YoLinkDeviceSessionDao();
    return YoLinkDeviceSessionDao.#singleton;
  }
}

module.exports = { YoLinkDeviceSessionDao };
