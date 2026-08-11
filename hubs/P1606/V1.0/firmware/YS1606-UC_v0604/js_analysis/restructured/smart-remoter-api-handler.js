// Original webpack module: 2620 (SmartRemoter API handler)
const { APIHandler } = require("./api-handler-base");

class SmartRemoterAPIHandler extends APIHandler {
  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }
}

module.exports = { SmartRemoterAPIHandler };
