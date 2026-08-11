# HTTP API Handler Tables

The HTTP-API counterpart to [`device-command-tables.md`](device-command-tables.md) (which catalogs the LoRa binary codec device handlers). Every class here extends `APIHandler` (see [`restructured/api-handler-base.js`](restructured/api-handler-base.js)) and is registered by type-key string in [`restructured/device-api-handler-registry.js`](restructured/device-api-handler-registry.js) (original module 14062). **All 26 are now fully hand-transcribed** - this table remains as a quick-reference index and a home for the cross-handler findings below, since the boilerplate (`fetchState`/`common` wrapping `_checkDeviceToken` + `_getCachedState`/`_sendDeviceMessage`, then stripping `location`) is nearly identical across most of them.

| Type key | Module | `nsDeviceType` | Methods |
|---|---|---|---|
| [COSmokeSensor](restructured/co-smoke-sensor-api-handler.js) | 87692 | `"hub"` **[sic - likely copy-paste bug, see below]** | getState (→fetchState), fetchState |
| [Dimmer](restructured/dimmer-api-handler.js) | 88412 | `"Dimmer"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedules, setDelay, setInitState |
| [DoorSensor](restructured/door-sensor-api-handler.js) | 90223 | *(unset)* | fetchState (strips `state.alertType`, not `location`), getState (→fetchState) |
| [Finger](restructured/finger-api-handler.js) | 98670 | `"finger"` | fetchState, getState (direct, not via `common`), toggle (hardcoded `state: "open"`) |
| [GarageDoor](restructured/garage-door-api-handler.js) | 61179 | `"garageDoor"` | fetchState, getState (direct), toggle (hardcoded `state: "open"`) |
| [Home](restructured/general-api-handler.js) | 16491 | *(unset)* | getDeviceList, getDeviceList2, getGeneralInfo |
| [Hub](restructured/hub-api-handler.js) | 39192 | `"hub"` | getState (renames `lte`→`cellular`), setWiFi (defaults `authType` from `encryption`, delegates to getState), scanWiFiList (`hub.wifiScan`, 16s timeout), resetCellular (`hub.resetLTE`) |
| [InfraredRemoter](restructured/infrared-remoter-api-handler.js) | 30264 | `"infraredRemoter"` | fetchState, common, learn (15s timeout), getState, setTimeZone, getSchedules, setSchedules, send |
| [LeakSensor](restructured/leak-sensor-api-handler.js) | 65205 | `"leakSensor"` | fetchState, common, setSettings (→`leakSensor.setInterval`), getState (→fetchState) |
| [Lock](restructured/lock-api-handler.js) | 17045 | *(unset)* | getState, setState, listPasswords, generateOTP, addPassword, delPassword, updatePassword, clearPassword, setTimeZone |
| [LockV2](restructured/lock-v2-api-handler.js) | 64684 | `"MFLock"` **[type-key mismatch, see below]** | fetchState, common, getState, setState, setTimeZone, userManagement, setAttributes |
| [Manipulator](restructured/manipulator-api-handler.js) | 85858 | `"manipulator"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedules, setDelay, setInitState |
| [MotionSensor](restructured/motion-sensor-api-handler.js) | 39035 | *(unset)* | fetchState, getState (→fetchState) |
| [MultiOutlet](restructured/multi-outlet-api-handler.js) | 43027 | `"multiOutlet"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedules, setDelay, setInitState |
| [MultiWaterMeterController](restructured/multi-water-meter-controller-api-handler.js) | 76893 | *(unset)* | **byte-identical to WaterMeterController below** - fetchState, common, setTimeZone, getState, setAttributes, setState, setDelay, getValveSchedules, setValveSchedules, getLeakSchedules, setLeakSchedules, setMeterAttributes |
| [Outlet](restructured/outlet-api-handler.js) | 29924 | `"outlet"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedule (→`outlet.setSchedules`, note singular method name), setSchedules, setDelay, setInitState |
| [PowerFailureAlarm](restructured/power-failure-alarm-api-handler.js) | 31383 | `"PFSensor"` | fetchState, getState (→fetchState) |
| [Siren](restructured/siren-api-handler.js) | 70804 | `"siren"` | fetchState, common, getState, setState, setDuration (→`siren.setDuation` **[sic, matches the LoRa-layer typo in device-command-tables.md]**) |
| [SmartRemoter](restructured/smart-remoter-api-handler.js) | 2620 | *(unset)* | fetchState, getState (→fetchState) |
| [Sprinkler](restructured/sprinkler-api-handler.js) | 74212 | `"sprinkler"` | fetchState, common, getState, setState, setManualWater, getSchedules, setSchedules |
| [Switch](restructured/switch-api-handler.js) | 29283 | `"switch"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedules, setDelay, setInitState |
| [Thermostat](restructured/thermostat-api-handler.js) | 78186 | `"thermostat"` | fetchState, common, getState, setState, setTimeZone, getSchedules, setSchedules, setECO, setProperties, getDREvents, setDREvents |
| [THSensor](restructured/th-sensor-api-handler.js) | 43160 | *(unset)* | fetchState (**3-hour** cache-freshness window, `10800000`ms, vs. the 16-hour default everywhere else), getState (→fetchState) |
| [VibrationSensor](restructured/vibration-sensor-api-handler.js) | 90107 | *(unset)* | fetchState, getState (→fetchState) |
| [WaterDepthSensor](restructured/water-depth-sensor-api-handler.js) | 77680 | *(unset)* | fetchState, common, getState (→fetchState, **not** via `common` like most other setAttributes-style handlers), setAttributes (→common) |
| [WaterMeterController](restructured/water-meter-controller-api-handler.js) | 83485 | *(unset)* | **byte-identical to MultiWaterMeterController above** - fetchState, common, setTimeZone, getState, setAttributes, setState, setDelay, getValveSchedules, setValveSchedules, getLeakSchedules, setLeakSchedules, setMeterAttributes |

## Patterns worth noting

- **`COSmokeSensor`'s constructor passes `"hub"` as its `nsDeviceType`** (`super("hub")`) - every other handler either passes its own matching device-type string or nothing at all. This looks like a copy-paste bug rather than intentional - a CO/smoke sensor API call would get its `method` field rewritten to a `hub.*` namespace, which would presumably fail against the actual device. Not verified against a live CO/smoke sensor in this pass.
- **`LockV2`'s `nsDeviceType` is `"MFLock"`**, not `"lockV2"` or `"lock"` - "MF" is presumably "multi-factor," suggesting `LockV2` devices support an additional auth factor beyond the PIN-code family covered by `lock-api-handler.js`. No `LoraCAN` device-command-table entry exists for `MFLock` in [`device-command-tables.md`](device-command-tables.md) - it may use a different transport/protocol entirely, or that handler simply wasn't found in the earlier LoRa-layer pass.
- **`WaterMeterController` and `MultiWaterMeterController` are byte-for-byte identical modules** - same pattern as `SwitchRegister`/`OutletRegister` sharing an identical command table at the LoRa layer (see `device-command-tables.md`). Both kept as separate files, matching the original bundle's genuine duplication.
- **`Finger` and `GarageDoor`'s `toggle` methods both send a hardcoded `state: "open"` command** regardless of caller-supplied params, and both then null-out-then-delete the response's `state` field (a no-op pair kept faithful to the source).
- **Cache-freshness windows vary by sensor type**: `api-handler-base.js`'s `_getCachedState` defaults to treating a device as "online" if its last report is within 16 hours, but `THSensor` overrides this to 3 hours - consistent with temperature/humidity sensors reporting far more frequently than, say, a door sensor.
- **Several handlers never set `nsDeviceType` at all** (`DoorSensor`, `MotionSensor`, `SmartRemoter`, `VibrationSensor`, `PowerFailureAlarm`/`PFSensor`, `WaterDepthSensor`, `Home`) - relying on the request's own `method` field already carrying the correct device-family prefix, rather than `api-handler-base.js`'s `_sendDeviceMessage` rewriting it.
- **Tracing every handler's `_sendDeviceMessage` call sites surfaced a real bug in `api-handler-base.js` itself**: an earlier transcription had that method's 2nd/3rd parameters swapped (merging the wrong one into the outbound command, passing the wrong one as the timeout/options argument to `general-client.js`). Every call site across all 26 handlers already called it with the correct argument order - only the base implementation was wrong. Fixed.
