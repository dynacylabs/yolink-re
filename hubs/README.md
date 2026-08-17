# Hubs

YoLink hubs act as LoRa &lt;-&gt; MQTT bridges between YoLink sensors and YoLink's cloud servers.

| Product | Nickname       | SoC                       | Notes                                   |
|---------|----------------|---------------------------|------------------------------------------|
| [P1603](P1603) | Non-speaker hub (mini / big) | ESP32 | Two board revisions: `V1.0` (mini) and `V2.4` (big) |
| [P1604](P1604) | Speaker hub    | ESP32 (assumed, same family as P1603) | No Ethernet |
| [P1605](P1605) | Hub variant    | TBD                        | Teardown photos only so far |
| [P1606](P1606) | Hub 4          | Rockchip (Linux-based)     | Different architecture from P1603-1605; uses `rkdeveloptool`/`rkbin` instead of ESP32 tooling |

## Default WiFi (factory state)
| Hub            | SSID           | Password    |
|-----------------|----------------|-------------|
| Big hub (P1603 V2.4)  | `YoSmart_Test` | `4009618609` |
| Mini hub (P1603 V1.0) | `ATE`          | `12345678`   |

## Debug Header (ESP32 hubs: P1603/P1604/P1605)
1.27mm pitch header.

```
Pin     Shape       Normal Signal       Bootloader Signal
0       Square      GND                 GND
1       Circle      VCC                 VCC
2       Circle      ESP RX              ESP RX
3       Circle      ESP TX              ESP TX
4       Circle      ESP EN??            VCC
5       Circle      ESP GPIO0??         GND
```

## Behavior notes
- Hubs forward **all** LoRa messages they hear over MQTT, regardless of which YoLink account the sending sensor is registered to (confirmed via testing, see [testing methodology](../docs/testing_methodology.md)).
- Boot flow (from serial logs, `esp-idf 3.2-dirty`): bring up Ethernet if present, else broadcast an AP and accept WiFi credentials over a local web server; once online, fetch hub configuration from `api.yolink.com` (URL appears unauthenticated, derived from hub UUID/serial), then register with YoLink's MQTT broker.

See [docs/writeup.md](../docs/writeup.md) for the full narrative writeup and [docs/testing_methodology.md](../docs/testing_methodology.md) for the test plan this was validated against.
