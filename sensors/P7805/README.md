# P7805

Round PCB, PIR-based motion sensor design (two-board: main + separate sensor board on a ribbon cable). Board silkscreen confirms `P7805_Main_V1.1` / `P7805_SENSOR_V1.1`.

## FCC filing — still not found, despite a real search effort
The FCC ID for this specific board (P7805) is **not identified**. `2ATM77804` was an early guess (numeric similarity, same general PIR-sensor design) but turned out to be a *different* board entirely - silkscreened `P7804-UC_V0.3`, not P7805. See [fcc_filings/2ATM77804/chip_identification.md](../../fcc_filings/2ATM77804/chip_identification.md) for the correction.

Board date codes (`JUW7.820.10138812`/`...819 V1.0, 2023.08.11`) put manufacturing around August 2023, which should narrow the search - but nothing in YoSmart's `2ATM7` grantee filings from that window (`2ATM75001V2`, `2ATM75002`, `2ATM71603M`, `2ATM75709`, `2ATM75707`, `2ATM77107`) is a plausible match, and two other specific candidates were checked and ruled out directly:
- **`2ATM77201`** ("Vibration Sensor") - internal photos show a small rectangular board in a case molded `P7706`, not P7805 or anything round/PIR-shaped.
- **`2ATM77107`** ("Outdoor Alarm Controller 2", model `YS7107-UC`) - a C-cell-battery siren/alarm unit, unrelated.

Possible explanations: it's a running production change filed as a same-FCC-ID "Model Difference" under an *existing* filing not yet checked here (YoSmart does this routinely - see the Model Difference letters in most other filings in this repo), or it simply hasn't been indexed by the mirror sites this research relied on (`fccid.io`, `fcc.report`) yet. Also worth noting: this board doesn't show a visible YoLink-branded [YL09](../../chips/YL09) chip the way every other sensor in this repo does - if you have the physical unit, a fresh close-up of the small QFN chip near the PIR element (visible but not confidently identified in the existing repo photos) would help resolve both the chip ID and, indirectly, which filing to look for.
