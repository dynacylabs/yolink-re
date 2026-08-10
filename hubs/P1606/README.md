# P1606 - "Hub 4"

Rockchip-based hub (Linux), unlike the ESP32-based P1603/P1604 or the MediaTek-based [P1605](../P1605). Requires `rkdeveloptool` (see [tools/rkdeveloptool](../../tools/rkdeveloptool)) to read/write flash via Maskrom mode instead of the ESP32 UART flashing approach used elsewhere in this repo. Real model number is `YS1606` (from the serial login banner, see below) - distinct from P1605's `YS1605-UC`.

See [`V1.0/README.md`](V1.0/README.md) for the debug harness pinout and chip-reading procedure.

## FCC filing — not yet identified
P1606/YS1606 does **not** share an FCC filing with [P1605](../P1605). An earlier pass through this repo assumed it did (both were recalled as covered by FCC ID `2ATM71605`, "Hub 3"), but that filing's internal photos show a MediaTek MT7628NN board silkscreened `P1605_V1.3` - a different, MIPS-based SoC. P1606's own serial capture (`V1.0/serial/uart_debug_1500000_power_on.log`) shows `BL31`/`GICv3`/`EL3`/"Preloader serial" (ARM Trusted Firmware boot stages, 64-bit-ARM-only) plus an LPDDR4 training sequence characteristic of Rockchip's SPL - confirms this hub really is ARM/Rockchip-based as documented here, and that the FCC-filing link was the mistake. No FCC ID has been identified for P1606/YS1606 yet - it didn't turn up in the `2ATM7` grantee listing pulled so far, and may not be public if this was a limited/pre-release unit (see the writeup for how this hub was acquired).
