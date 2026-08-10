# Chip Identification — 2ATM71605 ("Hub 3")

Product label confirms `YOLINK Hub 3, Model: YS1605-UC, FCC ID: 2ATM71605`.

![Product label](images/product-label-hub3.png)

**⚠️ Open question — read before trusting the device mapping below:** this filing's internal-photos board is silkscreened `P1605_V1.3`, which matches [hubs/P1605](../../hubs/P1605) in this repo. But this filing was *also* identified as covering [hubs/P1606](../../hubs/P1606) ("Hub 4"), and the chip in these photos is a **MediaTek MT7628NN** — not the Rockchip SoC that the rest of this repo documents for P1606 (based on hands-on flashing with `rkdeveloptool` in Maskrom mode, see [hubs/P1606/V1.0/README.md](../../hubs/P1606/V1.0/README.md)). MediaTek MT7628 and Rockchip are unrelated SoC families; a board can't be both. Either P1605 and P1606 are not actually the same filing/hardware after all, or one of the two devices' architecture notes elsewhere in this repo is wrong. This needs to be resolved by checking the physical hardware again — treat the P1605-vs-P1606 device mapping as unconfirmed until then.

Source: [`Internal Photos/Internal Photos-89837057.pdf`](Internal%20Photos/Internal%20Photos-89837057.pdf), 6 pages (also includes a bare 18650 li-ion cell — this hub has battery backup).

## Main SoC — MediaTek MT7628NN
![MediaTek MT7628NN](images/mediatek-mt7628nn.png)

Marked `MEDIATEK / MT7628NN / 2503-AF34` (partial - last line not fully legible). MT7628 is a MIPS-based WiFi router SoC (802.11n, integrated Ethernet switch) - a very different architecture from the Xtensa ESP32 used in [P1603](../2ATM71603M/chip_identification.md) and [P1604](../2ATM71604/chip_identification.md). Paired with a Winbond-branded package (likely serial NAND/eMMC flash or DRAM - exact part not legible) mounted on the same small system-on-module board.

Datasheet: [reference_data/datasheets/mediatek-mt7628nn.pdf](../../reference_data/datasheets/mediatek-mt7628nn.pdf)

## Board / connectivity notes
![Main board](images/main-board.png)

- `ATE`/`DEBUG` header rows are silkscreened directly on the board (`RXD2/TXD2/GND` for ATE, `RXD0/TXD0/RESET/GND` for DEBUG) - no need to hunt for test points on this one.
- `HanRun` Ethernet magnetics (same family of part as the other hubs).
- 18650 Li-ion cell (EVE `ICR18650/26V`, 2.55Ah) for battery backup - notable since none of the ESP32-based hubs in this repo are documented as having battery backup.
- The filing's antenna-callout photo labels `923.3Mhz Antenna` plus two separate `WIFI 2.4G` antennas (A and B) - so this board still does LoRa, WiFi, and (per the antenna diversity) possibly does it more seriously than the single-antenna ESP32 hubs.

## LoRa Radio — likely LLCC68, unconfirmed
![Separate small LoRa daughter-card](images/lora-daughtercard.png)

LoRa isn't on the main MediaTek board at all - it's a **separate small daughter card** with its own QFN radio chip, connected to the main board. Given YoLink used the Semtech LLCC68 on both other hubs in this repo, that's the most likely part here too, but the marking wasn't legible at the photo resolution available. Worth a second look with the physical hardware if you still have it.
