# YS8003 - Temperature and Humidity Sensor

Has an LCD display (board silkscreened `YS8003-UC_V1.0`) - the only sensor in this repo's current lineup with an on-device readout.

## FCC filing
FCC ID `2ATM78003`, listed by YoSmart as **"Temperature Humidity Sensor"**. See [fcc_filings/2ATM78003](../../fcc_filings/2ATM78003) for the full filing and [chip_identification.md](../../fcc_filings/2ATM78003/chip_identification.md).

Notably, this is the **only sensor in this repo that does not use the [YL09](../../chips/YL09) SiP** - it uses a discrete STMicroelectronics STM32L073RBT6 MCU plus a separate Semtech SX1276 LoRa radio module instead.

**Flash size discrepancy between dumps:** the `V0309` flash dump is 128 KB, matching the RBT6's actual flash size, but the earlier `Vx.x` dump is 192 KB - matching the YL09 SIP's larger STM32L073xZ instead. Not yet resolved; don't assume one of the two capture sizes is simply wrong without checking further.
