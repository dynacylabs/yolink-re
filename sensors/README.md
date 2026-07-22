# Sensors

LoRa sensors that report to a [hub](../hubs). Most are built around the [YL09](../chips/YL09) chip.

| Product | Description | Board |
|---------|-------------|-------|
| [P0706](P0706) | Sensor board | - |
| [P7805](P7805) | Sensor board | - |
| [YS7704](YS7704) | Door sensor | Built on [P0706](../chips/P0603) family |
| [YS7804](YS7804) | Sensor | - |
| [YS8003](YS8003) | Temperature and humidity sensor | - |

Common debug header (P0706 board):
```
PIN_NUM     SHAPE   SIGNAL
0           SQUARE  VCC/GND
1           CIRCLE  SWDIO
2           CIRCLE  SWCLK
3           CIRCLE  VCC/GND
4           CIRCLE  RESET
```
Board cannot be powered by ST-Link; needs an external power source while debugging.

Each device directory contains one subfolder per firmware version seen. `Vx.x` denotes a dump taken before the exact firmware version was identified.
