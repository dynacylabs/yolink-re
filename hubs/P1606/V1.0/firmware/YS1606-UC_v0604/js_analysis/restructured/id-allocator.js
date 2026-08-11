// Original webpack module: 12543
// Thin wrapper over the vendored `number-allocator` package (module
// 70423, already vendor-classified), constrained to the 1-65535 range -
// consistent with a 16-bit ID space (LoRaWAN frame counters and MQTT
// packet IDs are both plausible consumers; the actual caller wasn't
// traced in this pass).
const { NumberAllocator } = require("number-allocator");

class IdAllocator {
  numberAllocator;
  lastId;

  constructor() {
    this.numberAllocator = new NumberAllocator(1, 65535);
  }

  allocate() {
    this.lastId = this.numberAllocator.alloc();
    return this.lastId;
  }

  getLastAllocated() {
    return this.lastId;
  }

  register(id) {
    return this.numberAllocator.use(id);
  }

  deallocate(id) {
    this.numberAllocator.free(id);
  }

  clear() {
    this.numberAllocator.clear();
  }
}

module.exports = { IdAllocator };
