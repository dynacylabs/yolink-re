// Original webpack module: 2746
//
// Generic key/value store on top of SqlClient's SQLite database, with an
// in-memory MemoryCache read-through layer and content-hash (MD5)
// short-circuiting on writes (won't touch SQLite if the serialized value
// is byte-identical to what's already cached). Subclassed by every
// "Repository" class in this bundle (GatewayProfileRepository,
// YLSubnetDevicesRepository, YLDeviceStateRepository, etc.) - each just
// passes a different `type` string to partition its rows.

const { MemoryCache } = require("./memory-cache"); // original module 80643
const { SqlFactory } = require("./sqlite-storage");
const crypto = require("crypto");

class JsonSerializer {
  serialize(value) { return JSON.stringify(value); }
  deserialize(raw) { return JSON.parse(raw); }
}

class LocalStorageItem {
  type;
  sqlClient;
  serializer;
  cache;

  constructor(type) {
    this.type = type;
    this.sqlClient = SqlFactory.instance;
    this.serializer = new JsonSerializer();
    this.cache = MemoryCache.getCacheManager("LocalStorage");
  }

  setSerializer(serializer) {
    this.serializer = serializer;
  }

  loadAll() {
    const rows = this.sqlClient.getSqlite().prepare("select * from local_storage where type = ?").all(this.type);
    this.cache.delItems(this.type);
    rows.forEach((row) => this.cache.setCache(row));
    return Promise.resolve(rows);
  }

  load(key) {
    const rows = this.sqlClient.getSqlite().prepare("select * from local_storage where type = ? and key = ? limit 1").all(this.type, key);
    if (rows.length === 0) this.cache.delItem(this.type, key);
    return Promise.resolve(rows[0]);
  }

  save(key, content, sign) {
    this.sqlClient.getSqlite().prepare(`
            INSERT INTO local_storage (type, key, content, sign)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(type, key) DO UPDATE SET
            content=excluded.content,
            sign=excluded.sign
        `).run(this.type, key, content, sign);
    return Promise.resolve();
  }

  remove(key) {
    this.sqlClient.getSqlite().prepare("delete from local_storage where type = ? and key = ?").run(this.type, key);
    return Promise.resolve();
  }

  async getAll() {
    return (await this.loadAll()).map((row) => this.serializer.deserialize(row.content));
  }

  async get(key) {
    let cached = this.cache.getCache(this.type, key);
    if (cached == null) {
      cached = await this.load(key);
      if (cached != null) this.cache.setCache(cached);
    }
    if (cached != null) return this.serializer.deserialize(cached.content);
  }

  async set(key, value) {
    const serialized = this.serializer.serialize(value);
    const sign = crypto.createHash("md5").update(serialized).digest("hex").toLocaleLowerCase();
    const cached = this.cache.getCache(this.type, key);
    if (sign !== cached?.sign) {
      await this.save(key, serialized, sign);
      this.cache.setCache({ type: this.type, key, content: serialized, sign });
    }
    return Promise.resolve();
  }

  async del(key) {
    await this.remove(key);
    this.cache.delItem(this.type, key);
    return Promise.resolve();
  }
}

module.exports = { LocalStorageItem };
