// Original webpack module: 14062
//
// The master registry for the LCSubnet/Open HTTP API's per-device-type
// handlers (see api-handler-base.js's APIHandler pattern) - the HTTP-API
// counterpart to device-type-registry.js (which does the same job for
// the LoRa binary codec layer). All 26 handler classes are now fully
// transcribed - see device-api-handler-tables.md for the per-handler
// notes and findings (the CO/smoke sensor nsDeviceType bug, the
// byte-identical WaterMeterController/MultiWaterMeterController pair,
// the "MFLock" naming for LockV2, etc).

const { GeneralAPIHandler } = require("./general-api-handler"); // Home, module 16491
const { LockAPIHandler } = require("./lock-api-handler"); // module 17045
const { COSmokeSensorAPIHandler } = require("./co-smoke-sensor-api-handler"); // module 87692
const { DimmerAPIHandler } = require("./dimmer-api-handler"); // module 88412
const { DoorSensorAPIHandler } = require("./door-sensor-api-handler"); // module 90223
const { FingerAPIHandler } = require("./finger-api-handler"); // module 98670
const { GarageDoorAPIHandler } = require("./garage-door-api-handler"); // module 61179
const { HubAPIHandler } = require("./hub-api-handler"); // module 39192
const { InfraredRemoterAPIHandler } = require("./infrared-remoter-api-handler"); // module 30264
const { LeakSensorAPIHandler } = require("./leak-sensor-api-handler"); // module 65205
const { LockV2APIHandler } = require("./lock-v2-api-handler"); // module 64684
const { ManipulatorAPIHandler } = require("./manipulator-api-handler"); // module 85858
const { MotionSensorAPIHandler } = require("./motion-sensor-api-handler"); // module 39035
const { MultiOutletAPIHandler } = require("./multi-outlet-api-handler"); // module 43027
const { MultiWaterMeterControllerAPIHandler } = require("./multi-water-meter-controller-api-handler"); // module 76893
const { OutletAPIHandler } = require("./outlet-api-handler"); // module 29924
const { PowerFailureAlarmAPIHandler } = require("./power-failure-alarm-api-handler"); // module 31383
const { SirenAPIHandler } = require("./siren-api-handler"); // module 70804
const { SmartRemoterAPIHandler } = require("./smart-remoter-api-handler"); // module 2620
const { SprinklerAPIHandler } = require("./sprinkler-api-handler"); // module 74212
const { SwitchAPIHandler } = require("./switch-api-handler"); // module 29283
const { ThermostatAPIHandler } = require("./thermostat-api-handler"); // module 78186
const { THSensorAPIHandler } = require("./th-sensor-api-handler"); // module 43160
const { VibrationSensorAPIHandler } = require("./vibration-sensor-api-handler"); // module 90107
const { WaterDepthSensorAPIHandler } = require("./water-depth-sensor-api-handler"); // module 77680
const { WaterMeterControllerAPIHandler } = require("./water-meter-controller-api-handler"); // module 83485

// registerHandlers(handlerMap) - populates a Map (deviceType -> handler
// instance) used by message-dispatcher.js's HandlerDispatcher to route
// incoming Open API requests by device type. The original bundle `new`s
// each handler class inline at this same call site.
function registerHandlers(handlerMap) {
  handlerMap.set("COSmokeSensor", new COSmokeSensorAPIHandler());
  handlerMap.set("Dimmer", new DimmerAPIHandler());
  handlerMap.set("DoorSensor", new DoorSensorAPIHandler());
  handlerMap.set("Finger", new FingerAPIHandler());
  handlerMap.set("GarageDoor", new GarageDoorAPIHandler());
  handlerMap.set("Home", new GeneralAPIHandler());
  handlerMap.set("Hub", new HubAPIHandler());
  handlerMap.set("InfraredRemoter", new InfraredRemoterAPIHandler());
  handlerMap.set("LeakSensor", new LeakSensorAPIHandler());
  handlerMap.set("Lock", new LockAPIHandler());
  handlerMap.set("LockV2", new LockV2APIHandler());
  handlerMap.set("Manipulator", new ManipulatorAPIHandler());
  handlerMap.set("MotionSensor", new MotionSensorAPIHandler());
  handlerMap.set("MultiOutlet", new MultiOutletAPIHandler());
  handlerMap.set("MultiWaterMeterController", new MultiWaterMeterControllerAPIHandler());
  handlerMap.set("Outlet", new OutletAPIHandler());
  handlerMap.set("PowerFailureAlarm", new PowerFailureAlarmAPIHandler());
  handlerMap.set("Siren", new SirenAPIHandler());
  handlerMap.set("SmartRemoter", new SmartRemoterAPIHandler());
  handlerMap.set("Sprinkler", new SprinklerAPIHandler());
  handlerMap.set("Switch", new SwitchAPIHandler());
  handlerMap.set("Thermostat", new ThermostatAPIHandler());
  handlerMap.set("THSensor", new THSensorAPIHandler());
  handlerMap.set("VibrationSensor", new VibrationSensorAPIHandler());
  handlerMap.set("WaterDepthSensor", new WaterDepthSensorAPIHandler());
  handlerMap.set("WaterMeterController", new WaterMeterControllerAPIHandler());
}

module.exports = { registerHandlers };
