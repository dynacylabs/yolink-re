# P1606 - "Hub 4"

Rockchip-based hub (Linux), unlike the ESP32-based P1603/P1604/P1605. Requires `rkdeveloptool` (see [tools/rkdeveloptool](../../tools/rkdeveloptool)) to read/write flash via Maskrom mode instead of the ESP32 UART flashing approach used elsewhere in this repo.

See [`V1.0/README.md`](V1.0/README.md) for the debug harness pinout and chip-reading procedure.

## FCC filing
FCC ID `2ATM71605` ("Hub 3") - see [fcc_filings/2ATM71605](../../fcc_filings/2ATM71605).

**⚠️ Architecture conflict, unresolved:** the filing's internal photos show a board silkscreened `P1605_V1.3` using a **MediaTek MT7628NN**, which doesn't match the Rockchip SoC this page and `V1.0/README.md` describe (based on hands-on flashing via `rkdeveloptool`/Maskrom mode). Either this hub and [P1605](../P1605) don't actually share an FCC filing after all, or one of the two architecture descriptions in this repo is stale/wrong. Needs the physical hardware re-checked to resolve - see [fcc_filings/2ATM71605/chip_identification.md](../../fcc_filings/2ATM71605/chip_identification.md) for the full writeup.
