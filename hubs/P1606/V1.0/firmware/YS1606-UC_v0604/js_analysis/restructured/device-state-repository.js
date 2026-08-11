// Original webpack module: 88320 (YLDeviceStateRepository)
//
// Persists the last-known state per device (what yolink-device.js /
// yolink-hub.js call into via saveState/loadState). A custom serializer
// re-hydrates three timestamp fields back into real Date objects on read.
// saveState supports partial/merge updates so callers don't have to
// resend the full state on every report.

const { LocalStorageItem } = require("./local-storage-item");

class DeviceStateSerializer {
  serialize(value) {
    return JSON.stringify(value);
  }
  deserialize(raw) {
    const parsed = JSON.parse(raw);
    if (parsed) {
      if (parsed.createdAt != null) parsed.createdAt = new Date(parsed.createdAt);
      if (parsed.reportAt != null) parsed.reportAt = new Date(parsed.reportAt);
      if (parsed.updatedAt != null) parsed.updatedAt = new Date(parsed.updatedAt);
    }
    return parsed;
  }
}

class YLDeviceStateRepository extends LocalStorageItem {
  static #instance;

  constructor() {
    super("YLDeviceState");
    this.setSerializer(new DeviceStateSerializer());
  }

  // `options.setOnly` skips bumping reportAt (used when writing derived/
  // cached state that isn't itself a fresh device report). `options.extend`
  // shallow-merges nested attribute/alarm-setting/state objects instead of
  // overwriting them outright; `options.mergeState` additionally opts the
  // top-level `state` field into that same merge behavior.
  async saveState(deviceId, update, options) {
    const incomingState = update?.deviceState;
    let record = await this.get(deviceId);

    if (record === undefined) {
      record = {
        id: deviceId,
        createdAt: new Date(),
        reportAt: options?.setOnly === 1 ? undefined : new Date(),
        updatedAt: new Date(),
        deviceState: incomingState,
      };
      await this.set(deviceId, record);
      return;
    }

    record.updatedAt = new Date();
    record.reportAt = options?.setOnly === 1 ? record.reportAt : new Date();
    for (const field in incomingState) {
      const shouldMerge =
        (field === "attributes" || field === "alarmSettings" || (field === "state" && options?.mergeState === 1)) &&
        typeof incomingState[field] === "object";
      if (shouldMerge) {
        for (const subField in incomingState[field]) {
          record.deviceState[field][subField] =
            options?.extend === 1
              ? Object.assign({}, record.deviceState[field]?.[subField], incomingState[field][subField])
              : incomingState[field][subField];
        }
      } else {
        record.deviceState[field] = incomingState[field];
      }
    }
    await this.set(deviceId, record);
  }

  static of() {
    if (!YLDeviceStateRepository.#instance) YLDeviceStateRepository.#instance = new YLDeviceStateRepository();
    return YLDeviceStateRepository.#instance;
  }
}

module.exports = { YLDeviceStateRepository };
