# Outline: Reverse Engineering YoLink

Working title ideas: "Reverse Engineering YoLink: From Solar Flood Lights to ESP32 Ghidra Tooling" / "How I Almost Beat YoLink to Local Control"

**Format:** one long-form narrative document (not split into multiple posts). First-person, conversational voice throughout the narrative sections - jokes/frustration/asides are welcome, matches the tone of the original working notes. Technical primer boxes stay plain and clear (no jokes) so they're easy to skim or skip.

**Timeline:** kept deliberately abstract/relative - no firm dates, since the exact timeline isn't reliably remembered. This was on-and-off over a multi-year stretch (life happened in the middle of it - including a kid being born, which is a fair yardstick for how "on and off" it really was), and it eventually wound down when YoLink shipped an official local-control feature themselves, mooting the reason for doing this. Narrative language should use relative phrasing ("a long stretch," "on and off for years," "somewhere in the middle of all this") rather than specific months/years.

**Disclosure stance:** the unauthenticated config endpoint, the "hub relays all LoRa traffic regardless of account" behavior, and the near-miss on onboarding encryption keys were never reported to YoLink. Present all of these as neutral technical findings - no disclosure narrative, no timeline claims about a fix.

**Scope honesty:** more devices were physically analyzed than are represented in the repo/this writeup. Say so plainly rather than implying the repo is a complete record.

## How to read this document
A short reader's-guide block near the top, explaining the convention used throughout:
> 🔍 **Primer boxes** explain background concepts (LoRa/LoRaWAN, Ghidra, NVS, MITM proxying, JS minification, etc.) in plain terms. If you already know the concept, the box tells you exactly which heading to jump to next.

This lets the same document serve a reader who's never touched a soldering iron and a reader who does this for a living, without either one bouncing off it.

## 1. Introduction / Motivation
- The actual problem: solar flood lights, wanted IR remote control from Home Assistant
- **Property layout matters here**: long, narrow property - explain the physical constraint this created (why a single WiFi AP's range doesn't cover it, why running WiFi cable that far is impractical/expensive, why long-range LoRa specifically was attractive over other RF options)
- Options considered and rejected: WiFi IR blaster (range/cost), BLE IR blaster (range), 433MHz DIY (waterproofing)
- Why YoLink: 1/4 mile LoRa range, battery life, has an IR blaster device, other sensor types as a bonus (vibration, motion)
- The catch: cloud-dependent, no official local control at the time - sets up "can we get local control anyway?"
- Set expectations that this was a long, on-and-off effort, not a weekend project - land the "my son was born somewhere in the middle of this" beat here, as a relatable marker of how stretched-out it was
- *(No spoilers yet on how this ends - let the abandonment land later as the actual reveal.)*
- Primer box: LoRa vs WiFi/BLE/Zigbee - why range/battery tradeoffs work the way they do

## 2. Research Before You Buy: OSINT, Patents, and FCC Filings
- Before buying "sacrificial" hardware to tear down, did a lot of desk research first
- Heavy reliance on FCC ID filings (internal teardown photos, block diagrams required in filings) and patents to get a rough idea of what was inside a device before cracking it open
- Why this mattered practically: informed which devices were worth buying/destroying and which weren't, saved money on dead ends
- Primer box: what an FCC ID filing actually contains and how to look one up (ties to the `fccid.io/2ATM7` reference already in the repo)

## 3. Hardware Survey
- Hub family overview: P1603 (mini/big, ESP32+LLCC68), P1604 (speaker, no Ethernet), P1605, P1606 (Rockchip-based "hub 4" - different architecture entirely)
- Sensor family overview: YL09 chip (STM32L0 + integrated LoRa) as the common building block across most sensors; P0706/P7805 boards; YS7704 (door), YS8003 (temp/humidity), YS7804
- **The "dev unit" story**: YoLink briefly/prematurely listed a new hub for sale before it was ready - it turned out only 3 units existed at the time, built for their own developers. Ordered fast enough to catch it; YoLink offered a refund instead of shipping, asked for the device anyway, and they actually sent one of the 3 dev units (believed to be "hub 3" / P1605 based on how thin that device's material is in the repo). Good anecdote, keep it light/fun.
- Debug header discovery (continuity probing, 1.27mm pitch header) - and the honest caveat that **only one device was ever found with exposed/accessible debug headers for the YL09 chip itself** - most sensor teardowns didn't get that lucky
- Chip identification: esp32-wroom-32, llcc68 (Semtech, SX126x/SX127x-family LoRa radio over SPI)
- Honest caveat: more devices were physically analyzed over the years than made it into the repo or this document
- Primer box: what's a SiP / why "one chip" (YL09) can contain an MCU and a radio

## 4. Setting Up a Reverse-Engineering Lab
- A Raspberry Pi set up as a dedicated RE workbench (serial capture, flashing, running analysis tools)
- Purchased an **Orange Pi CM (Compute Module) dev board** specifically to desolder a YL09 chip off a YoLink board and re-host it on a carrier for focused, repeatable analysis - rather than working on YoLink's own PCB every time
- **`mitmweb`** (mitmproxy's web UI) set up to intercept/sniff traffic between a hub and YoLink's cloud - a network-layer complement to the firmware static analysis, not a replacement for it
- Primer box: what a MITM proxy actually does and why you'd bother when you already have firmware

## 5. Getting a Foothold: Serial and Flash
- Determining UART baud rate (`test_common_baud.py`) - relevant for P1606's unusual 1500000 baud
- What the serial logs reveal: esp-idf `3.2-dirty`, full boot flow (Ethernet-first, WiFi AP fallback, config fetch from api.yolink.com, MQTT registration)
- Dumping flash via debug header vs. P1606's Maskrom/`rkdeveloptool` approach (fundamentally different, since it's Rockchip/Linux, not ESP32)
- First-pass analysis: `strings`, `binwalk` - what showed up (mqtt, `SX126x hal`, `api.yolink.com` x4, not much else)
- Primer box: UART/serial debugging basics, what a "flash dump" actually is

## 6. The Pivot: Realizing the Hub Is Just a Dumb Relay
- Coming out of the serial-log boot flow and first-pass strings/binwalk (section 5), a suspicion forms early: the hub might be architecturally uninteresting - just a LoRa-to-IP relay with not much logic of its own
- Where the actually interesting logic/security more likely lives instead (the sensors, and to some extent the cloud side)
- An honest "wait, I might be pointed at the wrong box" beat - lands early, before the biggest tooling investment of the whole project
- Sets up the self-aware framing for section 7: build the Ghidra pipeline anyway (sunk cost, stubbornness, and because the tooling itself became the more interesting problem) rather than immediately pivoting away

## 7. Standing Up a Ghidra Workflow for ESP32 (the deep dive)
This is the section to go deepest on - a real step-by-step walkthrough of the pipeline, not just a summary of it. Frame it with the self-awareness from section 6: the hub was already suspected to be a dead end, and the pipeline got built anyway.
- Why the naive approach failed (Ghidra doesn't know ESP32/Xtensa out of the box)
- The two guides that unblocked this (Olof Astrand's Medium posts - esp32-flash-loader path and esp32-flash-parser/esp32_image_parser fallback path)
- The gap between "there's a plugin for this" and "the plugin actually works": found stale/incomplete forks (`ghidra-xtensa` processor, `ghidra-esp32-flash-loader`), had to combine forks and push fixes upstream
- **Full walkthrough of the pipeline**: compile esp-idf example projects -> run them through Ghidra analysis -> generate Rizzo signatures and GDT data-type archives from the *known* esp-idf binaries -> apply those signatures/types against YoLink's *black-box* firmware to get function names and types "for free" on things that are just stock esp-idf, so analysis time concentrates on YoLink's actual custom code
- SVD loader for peripheral memory mapping (`ghidra-svd-loader`), why doing this before auto-analysis matters
- `esp32_image_parser` as the fallback partition/segment parser when the flash-loader plugin misidentifies a dump
- End state: repeatable process to go from raw flash dump to an annotated Ghidra project (this is the P1603 mini hub OTA firmware project in the repo)
- Primer box: what Ghidra is / what a "processor module," "loader," and "signature" mean in Ghidra terms, for readers who've never opened it
- Heaviest use of skip-ahead signposting in the whole document for readers who already know Ghidra internals

## 8. What the Firmware and Network Analysis Found
- Partition table layout, NVS contents (WiFi creds, `gwConfig`)
- The `gwConfig`/MQTT auth mechanism and what `gwConfigMD5` is for
- **ChirpStack**: evidence that YoLink's backend uses (or closely resembles) ChirpStack, an open-source LoRaWAN network server - what this suggests about their architecture
- **The near miss**: got close to recovering the encryption key(s) used during initial device onboarding, but didn't fully close it out - tell this honestly as "so close" rather than a win
- What `mitmweb` sniffing of hub-to-cloud traffic revealed, as a complement to the firmware-side findings
- The unauthenticated hub-config endpoint keyed on UUID/serial - present as a neutral technical finding (no disclosure claim)
- Confirms the section 6 suspicion with concrete evidence - this is where the "dumb relay" theory gets validated, not just guessed at
- Primer box: NVS/flash partitions on ESP32, and separately, a plain-language primer on what "recovering an encryption key" from a boot/onboarding flow even means

## 9. Going Deeper on the Sensors
- Once the hub was understood to be a relay, the sensor side (YL09 chip) became the real target
- How the desoldered YL09-on-Orange-Pi-CM setup from section 4 got used here
- Be honest that this analysis is less complete/mature than the hub-side work - frame as ongoing/unfinished rather than wrapped up

## 10. Hub 4: The Weird One Out
- P1606 is architecturally distinct from the ESP32 hubs - Rockchip SoC, runs Linux
- Discovery that essentially all of Hub 4's application logic lives in a **JavaScript app** rather than native code
- The JS was deminified but never meaningfully deobfuscated/restructured (names still garbage, no real structure recovered)
- Sets up a future-work idea (see section 13): would've been interesting to run it through an AI tool to recover meaningful names/structure

## 11. Testing the Theories (the fun part)
- Test plan and results, walked through in order (full procedure lives in `testing_methodology.md`):
  1. Hubs can be restored to factory state via flash dump/reflash - **confirmed**
  2. Default test AP behavior (`YoSmart_Test` / `ATE`) - **confirmed**
  3. Custom AP redirection
  4. **The big one**: hubs forward ALL LoRa traffic over MQTT regardless of which account the sensor belongs to - **confirmed**, presented neutrally - what this means (a hub could in principle observe all LoRa traffic in range without being "paired" to it)
  5. Custom `gwConfig` without/with YoLink activation, and MQTT-bridge-to-YoLink mode - what passed, what it unlocks (local MQTT, no cloud dependency)
- Open theory, never tested: BLE-based initial config (borrowing from Emporia Vue precedent)
- Primer box: MQTT basics, for readers unfamiliar

## 12. The Rug Pull: YoLink Ships It First
- After years of on-and-off effort, the work tapers off
- YoLink releases official local control - the exact problem this whole effort was trying to solve
- The honest reaction: relief? annoyance? a little of both - let this be genuinely first-person
- Why finishing it anyway didn't make sense once the itch was scratched by the vendor
- Reframe: the flood lights were the spark, but the actual outcome that mattered was everything in sections 2-11, not whether the lights got hooked up

## 13. What Actually Came Out of This (the real payoff)
- The tools: forked/fixed/built six-plus repos that now make ESP32 firmware RE with Ghidra meaningfully easier for the *next* project, not just this one
- The findings: documented architecture, confirmed the LoRa-relay behavior, mapped out the boot/config flow, the ChirpStack lead, the near-miss on onboarding keys
- The honest retrospective: tool immaturity was the bigger time sink than the actual reverse engineering; what would you do differently starting today
- What's still open / never finished:
  - YL09-side firmware analysis (deeper than what section 9 covers)
  - the BLE onboarding theory, never tested
  - **Future idea**: run an existing personal `ai_auto_analysis` script against all the firmware images collected across the whole project - might still do this just for fun/documentation value
  - **Future idea**: run Hub 4's deminified-but-not-deobfuscated JS app through a modern AI tool to see if it can recover meaningful names/structure - would've been a very different (and probably much faster) analysis path than doing it by hand
- Closing note tying back to the abandonment: the tools and findings outlive the reason they were built for

## Appendix / Companion material
- Full testing methodology (link out to `testing_methodology.md`)
- Ghidra project setup steps (link out to `docs/ghidra_projects.md`)
- Repo tour / how to reproduce (link to top-level README)

## Production notes (not part of the narrative itself)
- Pull in real images from the repo wherever they naturally illustrate the text - hub teardown photos, debug header photos, etc. (e.g. `hubs/P1603/V1.0/board_images/`, `hubs/P1604/V2.2/board_images/`) rather than describing boards purely in prose
- Section 3's "dev unit" hub - double check which product number it actually was (referred to here as "hub 3" / tentatively P1605) before publishing

---

**Still open before drafting starts:**
1. Does this expanded structure look right, or is anything mis-ordered/misplaced (e.g. should the "hub is a dumb relay" pivot happen earlier, before the deep Ghidra-pipeline dive, rather than after)?
2. Want me to draft sections in order (1 -> 13), or a specific section first to gut-check the voice?
