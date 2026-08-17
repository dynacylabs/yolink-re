# Firmware Analysis Progress

Tracks the state of firmware reverse-engineering across every hub/sensor
revision in this repo - what's been analyzed, what's underway, and what's
still open. "Analysis" here generally means a real, function-by-function
Ghidra pass (for the ARM/Xtensa-based hubs and the STM32/YL09-based
sensors) or the equivalent hand-transcription effort (for P1606, which is
a Linux/JavaScript target, not a Ghidra one). Having a firmware *dump*
doesn't imply analysis has started - see "Not yet started" for dumps
sitting untouched.

## Done

- **[`sensors/YS7704/Vx.x`](sensors/YS7704/Vx.x)** - YL09 (STM32L073xZ) door/reed
  sensor. Every function analyzed and exported. Full radio (SX1276), timer,
  and MD5/AES crypto chains named. See
  [`sensors/YS7704/README.md`](sensors/YS7704/README.md).
- **[`sensors/P0706/V1.0`](sensors/P0706/V1.0)** - YL09 (STM32L073xZ) door/reed
  sensor. Every function analyzed and exported: downlink command protocol
  (including OTA block-transfer and provisioning/erase commands), wear-leveled
  flash journal, LoRaMac-node-style timer subsystem, full SX1276 driver, and a
  from-scratch AES-128/CMAC/CTR implementation forming the complete LoRaWAN
  encrypt+MIC pipeline. See [`sensors/P0706/README.md`](sensors/P0706/README.md).

## In progress

- **[`hubs/P1603/V1.0`](hubs/P1603/V1.0) - OTA image `YS1603_0368_202312111745`**
  (ESP32-D0WD-V3). Ghidra project exists and analysis is underway using the
  esp-idf Rizzo-signature/GDT pipeline documented in
  [`ghidra_projects.md`](docs/ghidra_projects.md), but not yet complete.

## Not yet started

Dump available, no analysis begun:

- **`hubs/P1603/V1.0` - `factory_state.bin`** (the full flash dump, distinct
  from the OTA image above - same board, not yet analyzed as its own
  target).
- **[`hubs/P1603/V2.4`](hubs/P1603/V2.4)** (ESP32-D0WD-V3, "ns_hub_big") -
  `factory_state.bin` present, unanalyzed.
- **[`sensors/YS7804/V0464`](sensors/YS7804/V0464)** (YL09) - flash + EEPROM
  dump present, unanalyzed.
- **[`sensors/YS8003/V0309`](sensors/YS8003/V0309)** (discrete
  STM32L073RBT6) - dump present, unanalyzed.
- **[`sensors/YS8003/Vx.x`](sensors/YS8003/Vx.x)** (STM32L0, larger capture -
  see the repo's own note on the size mismatch against V0309) - dump present,
  unanalyzed.

Blocked - no firmware dump captured yet:

- **[`hubs/P1604/V2.2`](hubs/P1604/V2.2)** (ESP32-WROVER-E "speaker hub") -
  teardown photos only.
- **[`hubs/P1605/V1.3`](hubs/P1605/V1.3)** (MediaTek MT7628NN "Hub 3") -
  teardown photos only.
- **[`sensors/P7805/V1.1`](sensors/P7805/V1.1)** - teardown photos only.

Excluded - known-invalid dump, not real firmware:

- **[`sensors/YS7704/V0418`](sensors/YS7704/V0418)** - its `0x08000000.bin`
  source is a captured UART/AT-command debug log, not a flash dump. See
  [`sensors/YS7704/README.md`](sensors/YS7704/README.md).

Different track entirely - not Ghidra targets:

- **[`hubs/P1606/V1.0`](hubs/P1606/V1.0)** (Rockchip, Linux/Node.js, "Hub 4") -
  the application-logic JS bundle is fully hand-transcribed (154 files, every
  device handler on both the LoRa and HTTP-API layers) - see
  [`js_analysis/README.md`](hubs/P1606/V1.0/firmware/YS1606-UC_v0604/js_analysis/README.md).
  A full, verified raw eMMC dump also exists
  ([`factory_state.bin.xz`](hubs/P1606/V1.0/firmware/factory_state/factory_state.bin.xz)),
  but its rootfs contents haven't been explored beyond confirming the
  filesystem itself is intact - real analysis of what's actually installed
  on that root partition, beyond the already-extracted JS app, hasn't
  started.
