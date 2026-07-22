# P1603 - Non-Speaker Hub

ESP32-based hub, no speaker. Two board revisions have been analyzed:

- [`V1.0`](V1.0) - "mini" hub
- [`V2.4`](V2.4) - "big" hub

Both revisions appear to run the same firmware/software; the boards differ mainly in size and component placement. Notable chip: an `llcc68` (Semtech, similar to SX126x/SX127x) LoRa transceiver communicating with the ESP32 over SPI.
