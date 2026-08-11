// Original webpack module: 80643
// Generic in-process cache, partitioned by an arbitrary "type" string
// into per-type Maps, with a per-cache-manager-name singleton registry.
// Consumer(s) not identified in this pass.
class MemoryCache {
  static #instances = new Map();
  cacheManger; // [sic] "cacheManger"

  constructor() {
    this.cacheManger = new Map();
  }

  setCache(item) {
    let bucket = this.cacheManger.get(item.type);
    if (bucket == null) {
      bucket = new Map();
      this.cacheManger.set(item.type, bucket);
    }
    bucket.set(item.key, item);
  }

  delItem(type, key) {
    let bucket = this.cacheManger.get(type);
    if (bucket != null) bucket.delete(key);
  }

  delItems(type) {
    let bucket = this.cacheManger.get(type);
    if (bucket != null) bucket.clear();
  }

  getCache(type, key) {
    let bucket = this.cacheManger.get(type);
    if (bucket != null) return bucket.get(key);
  }

  static getCacheManager(name) {
    if (!MemoryCache.#instances.has(name)) {
      MemoryCache.#instances.set(name, new MemoryCache());
    }
    return MemoryCache.#instances.get(name);
  }
}

module.exports = { MemoryCache };
