# Reference Data

Vendor reference files used across multiple devices (not tied to a single hub/sensor):

- `esp32.svd` - Espressif ESP32 peripheral register map, for use with [ghidra-svd-loader](../tools/ghidra/scripts/ghidra-svd-loader)
- `esp32_rom.elf` - ESP32 mask ROM ELF, useful for resolving ROM function calls in Ghidra
- `rkbin/` (submodule) - Rockchip boot/loader binaries, needed to flash/boot P1606 (Rockchip-based hub)

The STM32L0 SVD used for the YL09 chip lives with the chip itself at [chips/YL09/stm32L073xZ](../chips/YL09/stm32L073xZ) rather than here, since it's specific to that one chip.
