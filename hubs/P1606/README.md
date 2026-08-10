# P1606 - "Hub 4"

Rockchip-based hub (Linux), unlike the ESP32-based P1603/P1604 or the MediaTek-based [P1605](../P1605). Requires `rkdeveloptool` (see [tools/rkdeveloptool](../../tools/rkdeveloptool)) to read/write flash via Maskrom mode instead of the ESP32 UART flashing approach used elsewhere in this repo. Real model number is `YS1606` (from the serial login banner, see below) - distinct from P1605's `YS1605-UC`.

See [`V1.0/README.md`](V1.0/README.md) for the debug harness pinout and chip-reading procedure.

## FCC filing — not found despite a real search effort
P1606/YS1606 does **not** share an FCC filing with [P1605](../P1605). An earlier pass through this repo assumed it did (both were recalled as covered by FCC ID `2ATM71605`, "Hub 3"), but that filing's internal photos show a MediaTek MT7628NN board silkscreened `P1605_V1.3` - a different, MIPS-based SoC. P1606's own serial capture (`V1.0/serial/uart_debug_1500000_power_on.log`) shows `BL31`/`GICv3`/`EL3`/"Preloader serial" (ARM Trusted Firmware boot stages, 64-bit-ARM-only) plus an LPDDR4 training sequence characteristic of Rockchip's SPL - confirms this hub really is ARM/Rockchip-based as documented here, and that the FCC-filing link was the mistake.

No FCC ID has been found for P1606/YS1606, despite checking: the full `2ATM7` grantee listing (60 filings, current through today - no `1606`-numbered entry), direct FCC ID guesses, fccid.io/fcc.report search and company pages, and a search for the product's own user manual (which would normally print the FCC ID in its compliance section, but wasn't retrievable as text). One candidate (`2AFK9KT-MC-U01B`, "YoSmart Hub" by KingTing Tech. Corporation) turned out to be a 2015-era first-generation YoLink hub, long before P1603 even existed - not this device.

**Worth knowing for the writeup:** model `YS1606` is YoLink's current-generation **"Local Hub"** - their official local-API, Matter-enabled product (see https://shop.yosmart.com/products/ys1606). If the hardware in this repo is the same silicon as what's shipping today, this hub may be directly connected to the "YoLink shipped local control themselves" ending - possibly even a pre-release/dev unit of the exact product that made the rest of this project moot. Worth confirming against your own memory of when/how this unit was acquired before writing that section.
