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
