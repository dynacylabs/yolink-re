# Datasheets

Manufacturer datasheets for chips identified in this repo (mainly via [fcc_filings/](../../fcc_filings) internal photos). One copy per chip, shared across every device that uses it, linked from the relevant `chip_identification.md` and device `README.md` files rather than duplicated per device.

| File | Chip | Used in |
|---|---|---|
| [esp32-datasheet.pdf](esp32-datasheet.pdf) | Espressif ESP32-D0WD-V3 | [P1603](../../fcc_filings/2ATM71603M), [P1604](../../fcc_filings/2ATM71604) |
| [semtech-llcc68.pdf](semtech-llcc68.pdf) | Semtech LLCC68 | [P1603](../../fcc_filings/2ATM71603M), [P1604](../../fcc_filings/2ATM71604), likely [Hub 3](../../fcc_filings/2ATM71605) (unconfirmed marking) |
| [semtech-sx1276.pdf](semtech-sx1276.pdf) | Semtech SX1276 | [YS8003](../../fcc_filings/2ATM78003) |
| [espressif-psram64h.pdf](espressif-psram64h.pdf) | Espressif PSRAM64H | [P1604](../../fcc_filings/2ATM71604) |
| [gigadevice-gd25q32c.pdf](gigadevice-gd25q32c.pdf) | GigaDevice GD25Q32C | Closest available datasheet for the `25VQ32BSIG`-marked flash on [P1603](../../fcc_filings/2ATM71603M) - same GD25Q32 family, exact V (low-power) variant datasheet not confirmed identical |
| [mediatek-mt7628nn.pdf](mediatek-mt7628nn.pdf) | MediaTek MT7628NN | [Hub 3 filing](../../fcc_filings/2ATM71605) (device mapping unresolved, see that filing's chip identification doc) |
| STM32L073RB family | STMicroelectronics STM32L073RBT6 | [YS8003](../../fcc_filings/2ATM78003) - already on file at [chips/YL09/stm32L073xZ/stm32l073v8.pdf](../../chips/YL09/stm32L073xZ/stm32l073v8.pdf), not duplicated here |

## Not found
- **GigaDevice GD25Q64E** (marked flash on [P1604](../../fcc_filings/2ATM71604)) - every mirror tried (GigaDevice's own site, LCSC, Mouser, TME, Sekorm) either required login or blocked scripted downloads. Product page: https://www.gigadevice.com/product/flash/spi-nor-flash/gd25q64e
- **HanRun HR911550A** (Ethernet magnetics on both ESP32 hubs) - only close part-number relatives (HR911105A, HR913550A) turned up, not this exact one. Low priority - generic commodity part, not central to the RE effort.
