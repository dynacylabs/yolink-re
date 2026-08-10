# YS7704-UC - Door Sensor

Firmware version **0418** is the labeled dump ([`V0418`](V0418)); [`Vx.x`](Vx.x) is an earlier dump taken before the firmware version was identified.

## Pins
| Port  | Pin    | Signal                 |
|-------|--------|------------------------|
| GPIOA | 0x0100 | Sensor                 |
| GPIOC | 0x0200 | Red LED (active low)   |
|       | 0x0100 | Green LED (active low) |
|       | 0x0080 | Button                 |

## FCC filing
FCC ID `2ATM77704` (shared with [P0706](../P0706) - the underlying sensor board design). See [fcc_filings/2ATM77704](../../fcc_filings/2ATM77704) for the full filing and [chip_identification.md](../../fcc_filings/2ATM77704/chip_identification.md) (confirms a [YL09](../../chips/YL09) chip).
