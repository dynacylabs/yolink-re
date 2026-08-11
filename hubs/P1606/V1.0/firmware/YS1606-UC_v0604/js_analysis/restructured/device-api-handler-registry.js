// Original webpack module: 14062
//
// The master registry for the LCSubnet/Open HTTP API's per-device-type
// handlers (see api-handler-base.js's APIHandler pattern) - the HTTP-API
// counterpart to device-type-registry.js (which does the same job for
// the LoRa binary codec layer). Confirms the full set of 26 handler
// classes and resolves the mapping from type-key string to original
// module ID - most are NOT yet individually transcribed, but two are
// already done and this registry cross-confirms their type key:
//   - "Home"  -> module 16491 -> general-api-handler.js (GeneralAPIHandler)
//   - "Lock"  -> module 17045 -> lock-api-handler.js (LockAPIHandler)
//
// The remaining 24 handler classes (module IDs noted below) are
// cataloged - full method lists, not hand-transcribed source - in
// ../device-api-handler-tables.md, including a couple of real findings
// (a likely copy-paste bug in CO/smoke sensor's nsDeviceType, and two
// byte-identical WaterMeterController/MultiWaterMeterController modules).

const HANDLER_MODULE_IDS = {
  COSmokeSensor: 87692,
  Dimmer: 88412,
  DoorSensor: 90223,
  Finger: 98670,
  GarageDoor: 61179,
  Home: 16491, // -> general-api-handler.js
  Hub: 39192,
  InfraredRemoter: 30264,
  LeakSensor: 65205,
  Lock: 17045, // -> lock-api-handler.js
  LockV2: 64684,
  Manipulator: 85858,
  MotionSensor: 39035,
  MultiOutlet: 43027,
  MultiWaterMeterController: 76893,
  Outlet: 29924,
  PowerFailureAlarm: 31383,
  Siren: 70804,
  SmartRemoter: 2620,
  Sprinkler: 74212,
  Switch: 29283,
  Thermostat: 78186,
  THSensor: 43160,
  VibrationSensor: 90107,
  WaterDepthSensor: 77680,
  WaterMeterController: 83485,
};

// registerHandlers(handlerMap) - populates a Map (deviceType -> handler
// instance) used by message-dispatcher.js's HandlerDispatcher to route
// incoming Open API requests by device type. In the original bundle this
// directly `new`s each handler class inline; represented here as a table
// since the classes themselves aren't transcribed yet.
function registerHandlers(handlerMap) {
  for (const [type, moduleId] of Object.entries(HANDLER_MODULE_IDS)) {
    handlerMap.set(type, `<APIHandler for original module ${moduleId}, not yet transcribed>`);
  }
}

module.exports = { HANDLER_MODULE_IDS, registerHandlers };
