# Device-Type Command Tables

Every device-type handler in the bundle, with its full command table (extracted programmatically by parsing each module for `CommandRegister.register(id, "name", ...)` calls and/or `case <id>:` opcode switches plus `method = "name"` assignments — cross-checked against `device-type-from-appeui.js`'s model-key table and `device-session-store.js`'s device-class table). This is a complete accounting of every device-type handler module in the bundle (25 of them, plus [`door-sensor.js`](restructured/device-handlers/door-sensor.js), which got the full hand-transcription treatment as the pattern reference) — not a hand-transcription of each one's source, which for this batch would mean rewriting a lot of near-identical decode/encode boilerplate with limited additional insight over just seeing the command table itself. If a specific device type matters more than the others (i.e. one you actually own and want decoded fully), that's a good candidate for a follow-up pass using `door-sensor.js` as the template.

Two coexisting patterns, per `js_analysis/README.md`:
- **CommandRegister-based** (`register(opcodeId, "methodName", decode, encode)` calls) — cleaner, more structured, and includes both directions;
- **DataPacket-subclass** (a raw `switch (opcode)` over `case N:` with a separate `method = "..."` assignment per case) — older pattern.

| Device Type | Module | Lines | Pattern | Commands (opcode → method) |
|---|---|---|---|---|
| DoorSensor | [46678](restructured/device-handlers/door-sensor.js) | 108 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setOpenRemind |
| Siren | 5935 | 194 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 26→setState, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 39→setMute, 41→setDuation |
| SwitchRegister | 11039 | 153 | CommandRegister | 11→setInitState, 23→getState, 26→setState, 29→setDelay, 34→getSchedules, 35→setSchedules, 39→setDeviceAttributes, 48→DevEvent, 129→StatusChange, 130→powerReport, 131→Report |
| P5029Register | 18838 | 165 | CommandRegister | 23→getState, 26→setState, 39→setAttributes, 41→setMeterAttributes, 129→StatusChange, 131→Report |
| Finger | 20402 | 93 | DataPacket | 129→StatusChange, 131→Report, 22→getVersion, 23→getState, 26→setState |
| PowerFailureDetector | 25229 | 104 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 39→setOption |
| Thermostat | 30897 | 316 | DataPacket | 129→StatusChange, 131→Report, 4→factoryReset, 22→getVersion, 23→getState, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 39→setCorrection, 41→setProperties, 48→getDREvents, 50→setDREvents, 51/53/54→setECO-family |
| MultiOutlet | 32960 | 215 | DataPacket | 129→StatusChange, 130→powerReport, 131→Report, 4→factoryReset, 11→setInitState, 22→getVersion, 23→getState, 26→setState, 29→setDelay, 34→getSchedules, 35→setSchedules, 36→setTimeZone |
| InfraredRemoter | 46127 | 191 | DataPacket | 131→Report, 4→factoryReset, 21→learn, 22→getVersion, 23→getState, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 161-164→send (multiple IR-send opcodes) — **the IR-blaster device**, see the writeup's §1 |
| P7616Register (a lock) | 52429 | 394 | CommandRegister | 23→getState, 26→setState, 36→setTimeZone, 39→setAttributes, 40→Alert, 48→userManagement, 49→userManagementEvent, 129→StatusChange, 131→Report (plus ~13 more internal opcode cases for user/password-slot management, not individually named) |
| VibrationSensor | 53257 | 104 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setOpenRemind |
| WaterDepthSensor | 55432 | 118 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setAttributes |
| LeakSensor | 56464 | 135 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setInterval |
| VapeSoundDetector | 57509 | 118 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setProperties/setState |
| GasSmokeSensor | 61480 | 165 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 26→setState, 34→getSchedule, 35→setSchedule, 36→setTimeZone, 39→setInterval |
| Lock | 68948 | 260 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 26→setState, 36→setTimeZone, 48→getUsers, plus 0-6→addPassword/delPassword/updatePassword/clearPassword/addTemporaryPWD family |
| Sprinkler | 69164 | 210 | DataPacket | 129→StatusChange, 131→Report, 4→factoryReset, 22→getVersion, 23→getState, 26→setState, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 42→waterReport, 64→setManualWater |
| OutletRegister | 69987 | 148 | CommandRegister | identical command table to SwitchRegister (11/23/26/29/34/35/39/48/129/130/131) - likely shares most codec logic |
| GarageDoor | 71198 | 178 | DataPacket | 129→StatusChange, 130→powerReport, 131→Report, 4→factoryReset, 11→setInitState, 22→getVersion, 23→getState, 26→setState, 29→setDelay, 34→getSchedules, 35→setSchedules |
| Manipulator | 77801 | 212 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 4→factoryReset, 22→getVersion, 23→getState, 26→setState, 29→setDelay, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 39→setOpenRemind |
| P5005Register | 78025 | 217 | CommandRegister | 23→getState, 26→setState, 29→setDelay, 34→getValveSchedules, 35→setValveSchedules, 36→setTimeZone, 37→getLeakSchedules, 38→setLeakSchedules, 39→setAttributes, 40→Alert, 41→setLeakAttributes, 48→clearAlarmState, 49→calibrate, 129→StatusChange, 131→Report — a valve/leak-controller combo device |
| SmartRemoter | 81229 | 118 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setSettings |
| P5006/P5007/P5009Register | 85430 | 393 | CommandRegister | 23→getState, 26→setState, 29→setDelay, 34→getValveSchedules, 35→setValveSchedules, 36→setTimeZone, 37→getLeakSchedules, 38→setLeakSchedules, 39→setAttributes, 40→Alert, 41→setMeterAttributes, 53→getValveMaintance, 54→setValveMaintance, 129→StatusChange, 131→Report — one module registering **three** related device models (water meter/valve-controller family) |
| BodySensor | 94039 | 132 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 22→getVersion, 23→getState, 39→setInitState/setOpenRemind — motion sensor |
| THSensor | 98946 | 185 | DataPacket | 129→StatusChange, 131→Report, 40→Alert, 4/5→factoryReset-family, 22→getVersion, 23→getState, 37→DataRecord (historical log entries), 39→setCorrection, 41→setProperties, 42→setAlarm — matches [sensors/YS8003](../../../../../sensors/YS8003) |
| CSDevice | 94837 | 44 | (distinct, minimal) | Report, sendCommand — meaning of "CS" not determined in this pass; only 2 methods, likely a passthrough/generic device wrapper rather than a real sensor codec |
| Dimmer | 23561 | 251 | DataPacket | 129→StatusChange, 130→powerReport, 131→Report, 40→Alert, 4→factoryReset, 11→setInitState, 22→getVersion, 23→getState, 26→setState, 29→setDelay, 34→getSchedules, 35→setSchedules, 36→setTimeZone, 39→setDeviceAttributes, 41→setAlarm |

## Patterns worth noting across the whole table
- **Opcode 129 = StatusChange and 131 = Report are universal** across every device type - the shared envelope both patterns build on.
- **22 = getVersion, 23 = getState, 4 = factoryReset are near-universal** - consistent with the four "common commands" every `CommandRegister` instance gets for free (see `lora-packet-codec.js`'s `CommandRegister.#registerCommonCommands`), suggesting the DataPacket-subclass devices independently reimplement the same conventions rather than sharing the code.
- **34/35 = getSchedules/setSchedules and 36 = setTimeZone** appear on nearly every device with any kind of local automation capability (locks, outlets, sprinklers, thermostats, garage doors) - these devices can apparently run simple schedules independent of the hub/automation engine in `automation.js`.
- **40 = Alert is the near-universal alert opcode** for battery/sensor-class devices, but is *absent* from the actuator-class devices (SwitchRegister, OutletRegister, GarageDoor) - consistent with those being "things you command" rather than "things that report events."
