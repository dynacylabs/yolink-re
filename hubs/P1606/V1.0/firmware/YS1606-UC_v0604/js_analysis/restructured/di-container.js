// Original webpack module: 70875
// A minimal dependency-injection container - a bare Map keyed by
// service name. Consumer(s) not identified in this pass; likely an
// alternative/earlier registration mechanism to app.js's AppContext
// get/setContext, or used by a specific subsystem not yet traced.
const di = new (class {
  _services = new Map();

  register(name, service) {
    this._services.set(name, service);
  }

  get(name) {
    return this._services.get(name);
  }
})();

module.exports = { di };
