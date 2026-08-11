// Original webpack module: 69586
// Shared constants for the water-meter/valve-controller device family
// (device-command-tables.md's P5005/P5006/P5007/P5009/P5029 handlers).
const DeviceType = "WaterMeterController";
const P5029DeviceType = "WaterMeterMultiController";
const ENUM_LEAK_TYPE = ["schedule", "on", "off"];

module.exports = { DeviceType, P5029DeviceType, ENUM_LEAK_TYPE };
