// Original webpack module: 3721
// Typed accessor wrapper around app.getContext/setContext (see app.js's
// AppContext) - just one attribute defined: "ATE mode" (Automated Test
// Equipment / factory-test mode), read by internal-diagnostics-api.js's
// /_internal/status.
class AppContextAttr {
  _defaultVal;
  key;

  constructor(key, defaultVal) {
    this.key = key;
    this._defaultVal = defaultVal;
  }

  get() {
    return app.getContext(this.key) || this._defaultVal;
  }

  set(value) {
    app.setContext(this.key, value);
  }
}

class AppCtxAttrs {
  static ateMode = new AppContextAttr("_ate_mode", false);
}

module.exports = { AppCtxAttrs };
