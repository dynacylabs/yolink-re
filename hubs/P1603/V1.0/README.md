# P1603 V1.0 ("mini" hub)

## Contents
- `board_images/stock/` - unmodified board photos
- `board_images/debug/` - photos of the debug header/wiring
- `images/` - additional, unsorted teardown photos
- `firmware/factory_state/` - flash dump taken directly out of the box, plus extracted partitions, binwalk/strings output, and parsed NVS (`nvs.json`)
- `firmware/YS1603_0368_202312111745/` - firmware intercepted from an OTA update URL, plus a Ghidra project (`ghidra/`) with the completed analysis and a Ghidra Zip File export (`.gzf`)
- `serial_logs/` - serial capture from a sensor-binding session

## Debug header
See [../README.md](../README.md) in the hubs root for the ESP32 debug header pinout.

## FCC filing
FCC ID `2ATM71603M` (shared with [V2.4](../V2.4) - same electrical design). See [fcc_filings/2ATM71603M](../../../fcc_filings/2ATM71603M) for the full filing and [chip_identification.md](../../../fcc_filings/2ATM71603M/chip_identification.md) (ESP32-D0WD-V3, LLCC68, SPI flash, HanRun magnetics - all confirmed from filing photos).
