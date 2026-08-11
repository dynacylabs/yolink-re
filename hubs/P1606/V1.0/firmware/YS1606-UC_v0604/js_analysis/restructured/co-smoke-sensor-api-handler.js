// Original webpack module: 87692 (COSmokeSensor API handler)
//
// FINDING (see device-api-handler-tables.md): the constructor passes
// "hub" to APIHandler's constructor as this handler's nsDeviceType -
// every other handler either passes its own matching device-type string
// or nothing at all. This looks like a copy-paste bug (this module sits
// numerically right next to the real Hub handler, module 87692 vs the
// Hub handler's own module 39192 elsewhere - unclear if that's related,
// but the mistake is very much like grabbing a neighboring file's
// constructor call and not updating the string). A CO/smoke sensor API
// request would get its `method` field rewritten into the "hub.*"
// namespace by _sendDeviceMessage, which would presumably fail against
// the real device. Kept faithful to shipped (buggy) behavior. Only
// getState/fetchState are defined - no setState or other commands.

const { APIHandler } = require("./api-handler-base");

class COSmokeSensorAPIHandler extends APIHandler {
  constructor() {
    super("hub"); // [sic] - see FINDING above
  }

  getState(req, res) {
    return this.fetchState(req, res);
  }

  fetchState(req, res) {
    return this._checkDeviceToken(req)
      .then(() => this._getCachedState(req))
      .then((state) => {
        if (state != null && state.location != null) delete state.location;
        return state;
      });
  }
}

module.exports = { COSmokeSensorAPIHandler };
