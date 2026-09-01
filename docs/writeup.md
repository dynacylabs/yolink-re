# Reverse Engineering YoLink

*The chronological record of this project: why it started, what was found, why it went dormant, and why it's active again. This document supersedes the earlier `docs/writeup/` fragments (`writeup.md`, `outline.md`, `draft.md`, `image_tables.md`) and the working `HANDOFF.md`/`HANDOFF-2.md` session logs — everything in those is folded in here, in one place, in order. Where a section was never drafted into full prose, it's left as organized working notes rather than invented narrative, so nothing here claims a voice that wasn't actually written.*

**Status, in one sentence:** this was a multi-year, on-and-off effort that wound down when YoLink shipped official local control themselves — and then, in August 2026, picked back up anyway, for reasons that turned out to have nothing to do with the original flood lights. Part One below is the original effort, largely as drafted/outlined before the pause. Part Two is the revival, currently in progress.

---

## How to Read This Document

This is long, on purpose. It covers a multi-year, on-and-off reverse engineering effort, and it isn't written in a way that only makes sense to people who already do embedded RE for a living. At the same time, it's not trying to bore the people who do.

So: wherever a concept comes up that a lay reader might not know, it gets dropped into a clearly marked primer box, like this one:

> 🔍 **Primer: How these boxes work**
> Primer boxes explain background concepts in plain language — no jokes, no narrative, just the concept. If you already know what's in the box, skip it; it'll tell you exactly where to pick back up.
>
> **Skip to:** the next `##` heading.

If you're comfortable with LoRa, MQTT, Ghidra, embedded flash dumping, and so on, just skip every box you see and read the plain narrative. If you're not, read the boxes — they're there so the story still makes sense without prior background.

---

# Part One: The Original Effort

## 1. Introduction / Motivation

This whole thing started because I wanted to turn some lights on and off.

Specifically: [solar parking lot lights](https://www.amazon.com/gp/product/B0CQM577YH/ref=sw_img_1?smid=A335HFQ4KI1MBR&th=1) - the split-type kind, panel and battery separate from the actual light head, IP66-rated, absurdly-inflated-wattage-claim included at no extra charge. Three of them, bought as a lot at auction - not new, but in acceptable shape - that I wanted installed around my pond so we could fish it at night. Out of the box they already have a dusk-to-dawn mode built in, plus a cheap IR remote for manual override, and nothing else: no app, no schedule, no integration with anything, just point the remote at the fixture and press a button, same as any other IR gadget from the last thirty years. I wanted them in Home Assistant instead. Turn on at dusk (which they already do on their own, to be fair), off at a set time regardless of what the built-in sensor thinks, maybe tie them to a motion sensor down the road. Small, normal, extremely boring ask.

The problem is where I live. My property is long and narrow - more of a corridor than a yard - and the pond sits out past the part of it any of my networking gear reaches. We're talking 300-400 feet from the house, not the couple hundred I originally remembered when I first wrote this down. That shape matters more than it sounds like it should, because it kills most of the easy answers before you even get to compare them:

- **A WiFi-based IR blaster** sounds great until you remember WiFi range from a single access point craters well before 300-400 feet. You either run cable (expensive, and now I'm trenching or stringing wire across the whole property for three light fixtures) or you add more APs out there (more expense, more things to maintain, still for three light fixtures).
- **A BLE-based IR blaster** has the same problem, worse - BLE's practical range is shorter than WiFi's, so it doesn't even get partial credit here.
- **A DIY 433MHz solution** solves the range problem reasonably well, but now I'm building and weatherproofing my own outdoor RF hardware from scratch, and I did not trust my own enclosure-sealing skills enough to bet a winter of pond-side weather on it.

What I actually needed was something with real range, that ran on batteries so I wasn't running power out there either, and that I could eventually get talking to Home Assistant *locally* - no cloud round-trip just to flip a light switch a football field away from my router.

Enter YoLink. On paper, it checked every box: a quarter-mile of LoRa range (which, shaped property or not, is enormous overkill for 300-400 feet, in the best way), battery-powered sensors with genuinely long battery life, and - the thing that actually got my attention - they sell an [IR remote/blaster](https://www.amazon.com/gp/product/B0824FF9Y5/ref=sw_img_1?smid=A2E6L4XU587CP3&psc=1) as one of their sensor types, specifically built to learn and replay 38kHz IR codes like the ones my parking lot lights' remotes used. Bonus: their catalog also includes vibration sensors and motion sensors, which meant if this worked, I wasn't just solving "control some lights," I was picking up a general-purpose long-range sensor platform for the whole property.

There was exactly one catch, and it was a big one: everything runs through YoLink's cloud. Their Home Assistant integration exists, but it talks to YoLink's servers, not to your hub directly. There's no official "just do this locally" option. Which meant the actual question I was signing up to answer wasn't "can I control some flood lights" - it was "can I get this hub talking to my network *without* YoLink's cloud in the loop."

I did not appreciate, when I started poking at this, how long an answer to that question was going to take. This ended up being a project I picked up and put down over years, not weeks - there were entire stretches where the hub sat on a shelf while life happened around it. (For a sense of scale: somewhere in the middle of this, I had a son. That's roughly how "on and off" we're talking.)

I'm getting ahead of the story, though. Before any of the reverse engineering, there was a lot of just... reading.

> 🔍 **Primer: LoRa vs. WiFi/BLE/Zigbee**
> These are all radio protocols used in home/IoT devices, but they trade off range, battery life, and bandwidth very differently:
> - **WiFi** - fast, power-hungry, short range (tens of meters indoors, more outdoors but still limited). Great for streaming video, bad for a battery-powered sensor you want to last years on a coin cell.
> - **Bluetooth Low Energy (BLE)** - low power, but short range (similar ballpark to WiFi, often less).
> - **Zigbee** - low power, mesh-capable, but still fundamentally short-range per hop (tens of meters).
> - **LoRa** ("Long Range") - the opposite tradeoff: very low bandwidth (think bytes to low-kilobytes per message, not streaming), but range measured in *miles* under good conditions, and very low power draw, which is why LoRa sensors can run for years on small batteries. It's built for "send a tiny message a long way, rarely," which is exactly the shape of most home sensor data (a door opened, a temperature reading, a button press) - just not the shape of moving a lot of data quickly.
>
> **Skip to:** [Section 2](#2-research-before-you-buy-osint-patents-and-fcc-filings)

---

## 2. Research Before You Buy: OSINT, Patents, and FCC Filings

Before I bought a single "sacrificial" YoLink device to crack open, I spent a lot of time not buying anything at all - just reading.

This matters more than it sounds like it should, because teardown-driven reverse engineering has an unavoidable cost structure: every device you open is a device you might have to buy a second one of, because the first one didn't survive the process, or because you needed a stock/unmodified unit to compare against once you'd already desoldered something off the first. Multiply that across hubs, multiple sensor types, and multiple board revisions of each, and "just buy one and see" stops being a reasonable default. So before spending money, I wanted a rough mental model of what was actually inside a given device - what chips, what radio, roughly what the board looked like - so I could prioritize what to buy first and skip devices that were obviously just re-badged versions of something I already had.

Two sources did almost all of the work here:

**FCC filings.** Every device that intentionally radiates RF and gets sold in the US has to go through FCC certification, and the filings for that certification are public. YoSmart's filings live under FCC ID grantee code `2ATM7` (browsable at [fccid.io/2ATM7](https://fccid.io/2ATM7)), and depending on the device and how much of the filing YoSmart asked to keep confidential, you can often pull internal teardown photos, block diagrams, and test setup descriptions straight from the filing - before you've spent a dollar on the actual hardware. That's how several of the internal-photo PDFs that ended up in this repo's `hubs/` and `sensors/` directories were originally sourced - photos the FCC required YoSmart to submit, showing the boards from angles I hadn't opened a device far enough to see yet. *(This early, informal FCC-photo pass turned out to be a rough draft of a much more systematic effort - see [Part Two, §2](#2-fcc-filings-device-identification-and-chip-identification) for the full re-run of this research years later, done properly, with every filing downloaded and every chip on every board actually identified.)*

**Patents.** Patents are a messier source - deliberately vague in places, written by lawyers rather than engineers, and not always attached to the specific product revision you're looking at - but for a company like YoSmart with a fairly narrow product line, searching around their name and the LoRa-hub-and-sensor concept turned up filings that gave useful architectural hints: what the general hub-to-sensor relationship looked like from their own description of it, before I'd verified any of that against real hardware.

Between the two, I went into most purchases already having a rough idea of "this is probably an ESP32 with a LoRa radio riding alongside it" or "this board revision looks like a straightforward shrink of that one," which meant I could spend my actual hardware budget on devices likely to teach me something new, instead of buying blind and finding out after the fact that I'd just bought the same board in a different enclosure.

---

## 3. Hardware Survey

*(Not yet drafted into prose - working notes below, organized under the outline this section will eventually follow.)*

**Hub family overview**, nicknamed for ease of reference during analysis (analysis was done primarily on `ns_hub_mini`; the smaller hub looks like a refinement/compaction of the bigger one):

| Nickname | Product/Rev | Top | Bottom |
|:------------|:------------|:---|:---|
| ns_hub_mini | [P1603 V1.0](../hubs/P1603/V1.0) | ![top](../hubs/P1603/V1.0/board_images/stock/board_top.jpg) | ![bottom](../hubs/P1603/V1.0/board_images/stock/board_bottom.jpg) |
| ns_hub_big | [P1603 V2.4](../hubs/P1603/V2.4) | ![top](../hubs/P1603/V2.4/board_images/stock/board_top.jpg) | ![bottom](../hubs/P1603/V2.4/board_images/stock/board_bottom.jpg) |
| speaker_hub | [P1604 V2.2](../hubs/P1604/V2.2) | ![top](../hubs/P1604/V2.2/board_images/stock/board_top.jpg) | ![bottom](../hubs/P1604/V2.2/board_images/stock/board_bottom.jpg) |

Early, pre-teardown guesses at chips of interest on the non-speaker hubs: an **ESP32-WROOM-32** module and an **LLCC68** (Semtech, similar to the SX126x/SX127x family, looked like a COTS module with its own balun/matching circuitry, talking to the ESP32 over SPI). *(Both guesses were refined later - see Part Two: the ESP32 turned out to be a bare **ESP32-D0WD-V3** die, not a WROOM module, and the LLCC68 guess was confirmed exactly via FCC teardown photos.)* The speaker hub (P1604) has no Ethernet but otherwise appeared to be the same board family, compacted - later confirmed it's actually a **WROVER-E module** (ESP32 + PSRAM) rather than the bare die the other hubs use, presumably for audio buffering.

All hubs appeared to be the same underlying design, with the speaker hub as the notable exception (no Ethernet). Whether the firmware running on all of them is actually identical was never independently verified.

**Debug header photos:**

*ns_hub_big (P1603 V2.4)*

| | |
|:---:|:---:|
| ![debug_pinout](../hubs/P1603/V2.4/board_images/debug/debug_pinout.jpg) | ![debug_top](../hubs/P1603/V2.4/board_images/debug/debug_top.jpg) |

*ns_hub_mini (P1603 V1.0)*

| | | |
|:---:|:---:|:---:|
| ![debug_top_1](../hubs/P1603/V1.0/board_images/debug/debug_top_1.jpg) | ![debug_top_2](../hubs/P1603/V1.0/board_images/debug/debug_top_2.jpg) | ![debug_top_3](../hubs/P1603/V1.0/board_images/debug/debug_top_3.jpg) |

*speaker_hub (P1604 V2.2)*

| | |
|:---:|:---:|
| ![debug_top_1](../hubs/P1604/V2.2/board_images/debug/debug_top_1.jpg) | ![debug_top_2](../hubs/P1604/V2.2/board_images/debug/debug_top_2.jpg) |
| ![debug_top_3](../hubs/P1604/V2.2/board_images/debug/debug_top_3.jpg) | ![debug_top_4](../hubs/P1604/V2.2/board_images/debug/debug_top_4.jpg) |

**Sensors:** built around the [YL09](../chips/YL09) chip - a YoLink-branded SiP (system-in-package) combining an STM32L0 microcontroller with an integrated SX1276-family LoRa radio. Most of the sensor lineup shares this one chip; the exception found later (Part Two) is the YS8003 temperature/humidity sensor, which uses a discrete STM32L073RBT6 plus a separate SX1276 module instead of the integrated YL09.

**Still to capture here:** more sensor-internals photos; the "dev unit" story (YoLink briefly/prematurely listed a new hub for sale before it was ready - only 3 units existed, built for their own developers; ordered fast enough to catch the listing, was offered a refund instead of shipping, asked for the device anyway, and they actually sent one of the three dev units - believed to be "Hub 3"/P1605, though this is thin enough that it should be double-checked before publishing, especially against the fact that `2ATM71605` turned out to be a normal-looking retail FCC filing rather than something covering only 3 hand-built units - probably means the dev unit predates a later full release, but not confirmed); the honest caveat that only one device was ever found with actually-exposed/accessible debug headers for the YL09 chip itself - most sensor teardowns didn't get that lucky; and the broader honest caveat that more devices were physically analyzed over the years than are represented in this repo or this document.

> 🔍 **Primer: what's a SiP?** *(not yet written)* - explain why "one chip" (YL09) can contain both a microcontroller and a radio.

---

## 4. Setting Up a Reverse-Engineering Lab

*(Outline only - not yet drafted.)*

- A Raspberry Pi set up as a dedicated RE workbench (serial capture, flashing, running analysis tools).
- Purchased an **Orange Pi CM (Compute Module) dev board** specifically to desolder a YL09 chip off a YoLink board and re-host it on a carrier for focused, repeatable analysis, rather than working on YoLink's own PCB every time.
- **`mitmweb`** (mitmproxy's web UI) set up to intercept/sniff traffic between a hub and YoLink's cloud - a network-layer complement to the firmware static analysis, not a replacement for it. Useful reference found along the way: [Running a man-in-the-middle proxy on a Raspberry Pi 4](https://www.dinofizzotti.com/blog/2022-04-24-running-a-man-in-the-middle-proxy-on-a-raspberry-pi-4/).

> 🔍 **Primer: what a MITM proxy actually does** *(not yet written)* - and why you'd bother when you already have firmware.

---

## 5. Getting a Foothold: Serial and Flash

*(Working notes, not yet full prose.)*

**Debug headers:** 1.27mm spacing; pins VCC (3.3V), GND, RX, TX, and probably EN/GPIO0, worked out by probing continuity. A logic analyzer, bought later, would have made this a lot faster in hindsight. Full pinout table lives in [`hubs/README.md`](../hubs/README.md).

**Serial logs** turned out to be quite verbose. Confirmed the `esp-idf` version as `3.2-dirty` directly from the boot log. The initial (factory) boot flow, reconstructed from reading the log closely:

1. Start the Ethernet interface and broadcast a WiFi AP.
2. If Ethernet comes up: attempt DHCP. If DHCP succeeds, fetch configuration from `api.yolink.com`. If DHCP fails, fall through to WiFi setup.
3. If Ethernet stays down: wait for a device to connect to the broadcast AP; once connected, start a web server and wait for WiFi credentials; once received, attempt to join that WiFi network. Failure loops back to re-broadcasting the AP; success proceeds to fetching configuration from `api.yolink.com`, same as the Ethernet path.
4. Once configuration is received, register with `api.yolink.com`'s MQTT server.
5. Once MQTT-registered, start listening for LoRa messages.
6. Every LoRa message received gets forwarded to `api.yolink.com` over MQTT, which responds with an ACK that may or may not get relayed back down to the reporting sensor over LoRa.

A detail that stood out immediately: the hub appears to forward **every** LoRa message it hears over MQTT, not just ones from sensors on its own account - meaning a hub not registered to a given sensor's account might still relay that sensor's traffic to YoLink's servers. At the time this was a hypothesis needing more investigation; it was later **confirmed** (see [§11](#11-testing-the-theories-the-fun-part) and [`testing_methodology.md`](testing_methodology.md)).

Also noted: YoLink's MQTT server appears to require some form of password authentication, and the hub fetches its "configuration" from a URL that looks unauthenticated, apparently keyed off the hub's own UUID/serial number - raising the question of whether a local server could be substituted for `api.yolink.com` at that step (would need ARP or DNS cache poisoning, or a firmware modification, plus replicating whatever ACK behavior the real server implements).

**Flash dumping and first-pass analysis:**
- `strings` on the flash dump surfaced MQTT-related text, a line indicating an `SX126x hal` (a hint toward the actual radio driver in use), and `api.yolink.com` appearing four separate times. Modifying the flash directly risked tripping some security mechanism, which made a local-server approach (above) look more attractive than patching the firmware in place.
- `binwalk` didn't reveal much beyond some Linux paths and a handful of encryption-related strings.

> 🔍 **Primer: UART/serial debugging basics, and what a "flash dump" actually is** *(not yet written)*

---

## 6. The Pivot: Realizing the Hub Is Just a Dumb Relay

*(Outline only.)*

Coming out of the serial-log boot flow and the first-pass `strings`/`binwalk` results (§5), a suspicion started forming early: the hub might be architecturally uninteresting - just a LoRa-to-IP relay without much logic of its own - and the actually interesting logic and security surface more likely lived in the sensors, and to some extent the cloud side. This is an honest "wait, I might be pointed at the wrong box" moment, arriving *before* the biggest tooling investment of the whole project (§7) - which raises the obvious question of why the Ghidra pipeline got built anyway. Answer, honestly: sunk cost, a bit of stubbornness, and because the tooling itself became the more interesting problem in its own right.

---

## 7. Standing Up a Ghidra Workflow for ESP32 (the deep dive)

*(Working notes toward the deepest section of the document.)*

Loading the raw ESP32 flash dump straight into Ghidra was not promising out of the box - Ghidra doesn't know the ESP32 (Xtensa) architecture or its segmented image format natively. Found two Medium articles by Olof Astrand on this exact problem (mirrored under [`docs/references`](references)), pointing at `esp32-flash-loader` and `esp32-flash-parser`/`esp32_image_parser`. Cloned the referenced repos and found they needed real work: an Xtensa processor-module PR that had gone stale upstream. Combined the relevant forks and addressed the stale PR's review feedback to get something actually usable.

From there, built out real tooling for function identification against YoLink's black-box firmware:
- **Rizzo signatures**, generated by building esp-idf itself so the *known*, stock esp-idf binaries could be analyzed first and their function signatures captured - see [`esp-idf_rizzo`](../tools/esp-idf/esp-idf_rizzo) / [`ghidra-rizzo`](../tools/ghidra/scripts/ghidra-rizzo).
- **Ghidra data-type archives (GDT)**, generated the same way - see [`esp-idf_gdt`](../tools/esp-idf/esp-idf_gdt) / [`ghidra-gdt`](../tools/ghidra/scripts/ghidra-gdt).
- Applying those signatures/types against YoLink's actual firmware to get function names and types "for free" wherever the code was just stock esp-idf, so analysis time could concentrate on the custom code YoLink actually wrote.
- The **SVD loader** ([`ghidra-svd-loader`](../tools/ghidra/scripts/ghidra-svd-loader)) to resolve peripheral memory-mapped addresses, applied before auto-analysis rather than after.

End state at the time: a repeatable pipeline from raw flash dump to an annotated Ghidra project - this became the P1603 mini-hub OTA firmware project still in this repo. Full setup steps for the overall process (superseding an earlier standalone `GhidraProjects.md` note) now live in [`ghidra_projects.md`](ghidra_projects.md) and, for the sensor side specifically, [`../INSTRUCTIONS.md`](../INSTRUCTIONS.md).

> 🔍 **Primer: what Ghidra is, and what a "processor module," "loader," and "signature" mean in Ghidra terms** *(not yet written)* - heaviest use of skip-ahead signposting in the whole document belongs here, for readers who already know Ghidra internals.

---

## 8. What the Firmware and Network Analysis Found

*(Working notes.)*

- The hub's "configuration" fetch (unauthenticated, keyed on UUID/serial - see §5) and the MQTT authentication mechanism (`gwConfig`, `gwConfigMD5`) were both present in the ESP32 firmware, consistent with what the serial logs already suggested.
- Early suspicion of a **ChirpStack**-based backend (an open-source LoRaWAN network server) started here, from the shape of the config/auth flow - this was a lead, not yet a confirmed finding at this stage. *(It was independently and much more thoroughly confirmed years later on the Hub 4 side - see [Part Two, §1](#1-hub-4-p1606-javascript-analysis--taken-to-completion).)*
- **The near miss:** got close to recovering the encryption key(s) used during initial device onboarding, but never fully closed it out. Presented honestly as "so close," not a win.
- `mitmweb` sniffing of hub-to-cloud traffic (§4) complemented the firmware-side findings, though the specific results from that sniffing weren't captured in detail here.
- This is where the §6 "dumb relay" suspicion started getting concrete evidence behind it, rather than remaining just a hunch.

> 🔍 **Primer: NVS/flash partitions on ESP32**, and separately, **what "recovering an encryption key" from a boot/onboarding flow even means** *(not yet written)*

---

## 9. Going Deeper on the Sensors

*(Outline only.)*

Once the hub was understood to likely be a relay, the sensor side (the YL09 chip) became the real target - this is where the desoldered YL09-on-Orange-Pi-CM setup from §4 was meant to get used for focused analysis. At the time this section was outlined, this work was explicitly less complete/mature than the hub-side work, and was framed as ongoing/unfinished rather than wrapped up. *(As of the revival, this is no longer purely aspirational - a real function-by-function Ghidra analysis of the P0706 sensor firmware is now complete, with YS7704 in progress. See [Part Two, §3](#3-yl09-sensor-firmware-ghidra-analysis-task-19).)*

---

## 10. Hub 4: The Weird One Out

*(Outline only - update: the core premise of this section changed during the revival.)*

P1606 ("Hub 4") is architecturally distinct from the ESP32 hubs - it's Rockchip-based and runs Linux, not Xtensa/esp-idf. The notable discovery: essentially all of Hub 4's application logic lives in a **JavaScript** app (a Node.js process) rather than native code. At the time this was outlined, the JS had been de-minified (beautified) but never meaningfully restructured - names still garbage, no real structure recovered, with "run it through an AI tool" floated as a future-work idea (§13).

*That future-work idea has since happened.* The entire bundle - all 1,206 modules, all 216 modules of actual custom code - has now been classified and, for the custom code, hand-transcribed, including every device-type handler on both the LoRa and HTTP-API layers. It surfaced substantially more than expected, including a handful of real security findings. Full account in [Part Two, §1](#1-hub-4-p1606-javascript-analysis--taken-to-completion).

---

## 11. Testing the Theories (the fun part)

*(Outline only - test plan and full procedure live in [`testing_methodology.md`](testing_methodology.md).)*

In order:
1. Hubs can be restored to factory state via flash dump/reflash - **confirmed**.
2. Default test AP behavior (`YoSmart_Test` / `ATE`) - **confirmed**.
3. Custom AP redirection - tested.
4. **The big one**: hubs forward *all* LoRa traffic over MQTT regardless of which account the sensor belongs to - **confirmed**, presented neutrally. Practical implication: a hub could, in principle, observe all LoRa traffic in range without being "paired" to it.
5. Custom `gwConfig`, with and without YoLink activation, and MQTT-bridge-to-YoLink mode - what passed, and what it unlocks (local MQTT, no cloud dependency).

Open theory, never tested: BLE-based initial configuration, borrowing from the precedent set by the Emporia Vue's onboarding flow.

> 🔍 **Primer: MQTT basics** *(not yet written)*

---

## 12. The Rug Pull: YoLink Ships It First

*(Outline only.)*

After years of on-and-off effort, the work tapered off. YoLink released official local control themselves - the exact problem this whole project set out to solve. The honest reaction was some mix of relief and annoyance, and finishing the from-scratch effort anyway stopped making sense once the itch had already been scratched by the vendor. The flood lights were the original spark, but the actual outcome that mattered was everything in §2-11, not whether the lights ever got hooked up to Home Assistant.

*This was meant to be the ending. It wasn't.* See Part Two.

---

## 13. What Actually Came Out of This (the original retrospective)

*(Outline only, written before the revival - kept as the original "final word," with the revival now genuinely extending past it.)*

- **The tools**: forked, fixed, or built six-plus repos that now make ESP32 firmware RE with Ghidra meaningfully easier for the next project, not just this one.
- **The findings**: documented architecture, confirmed the LoRa-relay-all behavior, mapped the boot/config flow, the ChirpStack lead, the near-miss on onboarding keys.
- **Honest retrospective**: tool immaturity was the bigger time sink than the actual reverse engineering.
- **What was still open at the time**: deeper YL09-side firmware analysis (now substantially underway - Part Two, §3); the BLE onboarding theory, still never tested; running a personal `ai_auto_analysis` script against the whole firmware collection, floated as a "might still do this for fun" idea (still not done); running Hub 4's JS through an AI tool to recover structure (**done** - Part Two, §1).

The closing note at the time was that the tools and findings outlive the reason they were built for. Turned out to be more literally true than intended - the project outlived its own ending.

---

# Part Two: The Revival (2026)

The project sat dormant for a real stretch after Part One's "rug pull" ending. It picked back up in August 2026 - not because the original flood-light problem resurfaced, but because the repo itself needed consolidating, the FCC/chip-identification research from §2 deserved a proper systematic re-run, and Hub 4's JS bundle (§10) turned out to be worth finishing by hand after all. What follows is that work, in order.

## 1. Repo consolidation: `yolink` + `yolink_re` → `yolink-re`

Two separate, overlapping local repos existed - `yolink` (newer, more reorganized) and `yolink_re` (older, less current, but with some unique content the newer one had dropped) - plus an empty `yolink-re` repo already created on GitHub. Consolidated into one repo, with deliberate choices along the way:

- **Fresh git history**, not a merge of both repos' full histories - `yolink_re`'s `.git` alone was 898MB (binaries committed directly, no LFS), not worth dragging in. Both old repos stay on GitHub as archives.
- **Submodules deduplicated.** The old `yolink_re` repo referenced a full ~20GB Ghidra-fork submodule; dropped in favor of the lighter tooling approach `yolink` had already moved to, itself further cleaned up into direct git submodules rather than a wrapper download script. Investigated and eliminated nested-submodule duplication (several of the "repos of interest" themselves referenced submodules that were *also* independently vendored at the top level) - documented that cloning must use `git submodule update --init` (non-recursive) to avoid ever checking out the duplicates.
- **File-level deduplication**: computed checksums across both source repos, found 34 files living at different paths with identical content, merged directory structures per-device keeping the union of unique analysis artifacts from both sides (e.g. `yolink_re` had a real Ghidra project for the P1603 mini hub's OTA firmware that `yolink` lacked).
- **`rkdeveloptool` submodule problem**: the old repo pointed at a `dynacylabs` fork of this tool that no longer exists (confirmed gone, not a permissions issue). Repointed directly at the upstream `rockchip-linux/rkdeveloptool`, matching the precedent already set by `rkbin`.

Final structure: `chips/`, `hubs/`, `sensors/`, `docs/`, `reference_data/`, `tools/` (11 submodules total after cleanup), plus `fcc_filings/` added in the next phase. Docs rewritten throughout to match. Committed as `44bce2c` ("Consolidate yolink and yolink_re into a single organized repo," 181 files).

## 2. FCC filings, device identification, and chip identification

A proper, systematic re-run of the informal FCC-photo research from Part One §2 - this time downloading every filing and identifying every chip on every board, not just skimming photos ahead of a purchase decision.

**Device → FCC ID mapping**, confirmed device by device against real photos (not just numeric-similarity guesses - a `2ATM77804` guess for P7805 was initially accepted, then caught and corrected once the actual filing's board silkscreen read `P7804-UC_V0.3`, a different, undocumented-elsewhere product):

| Device | FCC ID |
|---|---|
| P1603 (both revisions) | `2ATM71603M` |
| P1604 (speaker hub) | `2ATM71604` |
| P1605 ("Hub 3") | `2ATM71605` |
| P1606 | *unresolved, see §5* |
| P0706 / YS7704 (share a filing) | `2ATM77704` |
| YS7804 | `2ATM77805` |
| YS8003 | `2ATM78003` |
| P7805 | *unresolved, see §5* |

Downloaded all filings (79 files, ~69MB) with a personal tool, [`fccid_downloader`](../tools/fccid_downloader), reorganized under a new top-level `fcc_filings/<FCC_ID>/` directory (one per filing, since some filings cover more than one device directory).

**Chips identified, by filing** (rasterized internal-photo PDFs at up to 1200dpi, cropped and read printed part markings directly):

- **`2ATM71603M` (P1603, both revisions):** Espressif **ESP32-D0WD-V3** (bare die, not a WROOM module - correcting the early Part-One guess), Semtech **LLCC68** LoRa radio (confirming the early guess exactly), an external SPI flash (closest match: GigaDevice GD25Q32/GD25VQ32 family), **HanRun HR913550A** Ethernet magnetics (corrected mid-pass from an earlier misread of "HR911550A"). One small QFN near the ESP32 remains unidentified - confirmed genuinely out of focus in the source photo at every DPI tried, not a resolution problem on this end.
- **`2ATM71604` (P1604, speaker hub):** an **ESP32-WROVER-E module** (not a bare die like P1603 - includes onboard PSRAM, presumably for audio buffering), containing the same ESP32-D0WD-V3 die, a **GD25Q64E** SPI flash (double P1603's capacity), and **PSRAM64H**. Same LLCC68 radio as P1603, confirming YoLink standardized on it across at least two hub generations. Audio amplifier chip: unidentified, same "genuinely out of focus" conclusion.
- **`2ATM71605` ("Hub 3," P1605 only):** a **MediaTek MT7628NN** - a MIPS-based WiFi router SoC, architecturally unrelated to the ESP32 hubs. Bare 18650 Li-ion cell for battery backup, on-board `ATE`/`DEBUG` header rows, LoRa radio on a separate daughter card whose chip marking was unreadable even at 1200dpi.
- **`2ATM77704` ("Door Sensor," covers P0706 and YS7704):** **YoLink YL09**, the cleanest photo of that chip obtained all pass - pulled into `chips/YL09/images/` as the first locally-hosted real photo of it.
- **`2ATM77805` (YS7804):** YL09 again, confirmed though the exact lot code was hard to read against the darker soldermask used on this board.
- **`2ATM78003` (YS8003):** the one sensor in the lineup that does *not* use YL09 - a discrete **STM32L073RBT6** (the same STM32L0 core that's *inside* the YL09 SiP, used standalone here) plus a separate **Semtech SX1276** module on its own daughter board. This filing is dated 2019, the earliest of the sensor filings, consistent with predating YoLink's apparent later standardization on LLCC68.

Datasheets sourced for every identified chip, saved once each under `reference_data/datasheets/`. Note on sourcing: most electronics-distributor sites actively block scripted downloads (return an HTML bot-check page with a `200` status, easy to miss if you don't check the actual file type); what reliably worked was GitHub-raw driver-library mirrors, SparkFun/Adafruit CDN mirrors, Octopart's direct PDF host, and - most productively - JLCPCB's part-detail pages, which embed a signed, time-limited CDN URL that a plain `curl` can fetch.

## 3. Resolving the P1605 / P1606 architecture conflict

The chip-ID pass above found `2ATM71605` ("Hub 3") to be MediaTek MT7628-based - but this repo's existing hands-on documentation for P1606 describes a Rockchip SoC accessed via `rkdeveloptool` in Maskrom mode. Those can't be the same board; MediaTek MT7628 (32-bit MIPS) and Rockchip's ARMv8-A parts are unrelated families.

Resolved by reading P1606's own UART boot log closely: it shows an LPDDR4 DDR-training sequence and ARM Trusted Firmware boot stages (`BL31`, `EL3`, `GICv3`) that are architecturally impossible on a 32-bit MIPS chip like the MT7628. Conclusion: **P1605 and P1606 are two different devices that never shared an FCC filing** - the earlier link (a recollection-based guess from reviewing photos) was a mistake. `2ATM71605` belongs to P1605 alone; P1606's own FCC ID is still unknown (§5).

## 4. Gap-closing research pass

A status check (grepping the whole repo for flag words like "unconfirmed"/"not identified" rather than relying on memory) turned up several open items, then a pass to close what was closeable autonomously:

- Re-examined the three still-unidentified hub chips (P1603's QFN, P1604's audio amp, P1605's LoRa daughter-card chip) at up to 1200dpi with sharpening/contrast enhancement - confirmed all three are genuinely out of focus in FCC's own source photographs, not a rasterization ceiling on this end. Documented explicitly so a future pass doesn't repeat the attempt.
- Searched extensively for P1606's and P7805's real FCC IDs - neither resolved (full search trail documented in `hubs/P1606/README.md` and `sensors/P7805/README.md`, see §5). Notable side-finding: model `YS1606` is YoLink's current-generation "Local Hub" - their actual shipping local-API, Matter-enabled product - which may be directly relevant to how this document's Part One §12 ending should eventually be revised, if the hardware in this repo turns out to be an early unit of the very product that ended the original project.
- Found the two remaining missing datasheets (GD25Q64E, HanRun magnetics) via the JLCPCB CDN-URL trick above; the HanRun search is what caught the HR911550A → HR913550A misread.

## 5. Hub 4 (P1606) JavaScript analysis - taken to completion

This directly closes out Part One §10's "future work" idea. Extracted from `hubs/P1606/V1.0/firmware/YS1606-UC_v0604/usr/lib/p1606/p1606mq-dev.tar.gz`: a 3.2MB, single-line `index.js` webpack/Terser bundle. Turned out to be minified, not obfuscated - variable names are short but string literals, `require()` calls, and property names all survived intact, which made this the easy case for a from-scratch, by-hand restructuring pass (not, in the end, an off-the-shelf "run an AI tool at it" black box - actually reading and rewriting every custom module, the same way the ESP32 firmware analysis was already being done).

**Method**: split the bundle into its 1,206 individual webpack modules (catching and fixing a module-boundary bug along the way that silently merged classic-`function`-syntax modules into whichever arrow-function module preceded them), then repeatedly refined a vendor-vs-custom fingerprint across the whole set - Express and its ~20 internal packages, MQTT.js, gRPC, protobuf/`jspb`, Redis, Luxon, the embedded `aedes` MQTT broker, and more - until convergence: **216 modules (~13,600 lines) of genuinely custom, YoLink-authored code**, all 154 files' worth hand-transcribed with real names and structure, preserving the bundle's own bugs faithfully (flagged inline with `// [sic]`) rather than silently fixing them.

**Full coverage of every device handler**: all 25 LoRa-layer device-type codecs and all 26 HTTP-API-layer handlers, both previously only cataloged by opcode table, are now fully read and rewritten. That close reading surfaced real firmware bugs invisible to a catalog-only pass - a `readUint16BE` typo that would throw at runtime (LeakSensor), an inverted bitmask operator that zeroes out a whole field (P5029Register), a mismatched credential-type byte between encode and decode (P7616Register), a missing decode branch (OutletRegister), a copy-paste device-type-routing bug (COSmokeSensor's HTTP handler), and an undocumented product variant identifying itself internally as `"MFLock"` (LockV2).

**Security-relevant findings**, the significant new material from this pass:
- **Hardcoded local MQTT broker credentials**, three separate instances across three different files, all static and identical across every hub running this firmware build, gating the hub's own embedded MQTT broker. Not yet verified whether that broker (bound with no explicit host, port 18080) is reachable from the LAN or only localhost.
- **The local HTTP API's OAuth2/JWT scheme reduces to a computable secret** - every credential in it is `MD5(subnetId:familyId[:loraNetId])`, both values visible in ordinary cloud API responses, meaning a valid local-API token can be minted without ever contacting the hub.
- **The firmware update mechanism has no signature verification** - downloads an arbitrary URL, can skip its own MD5 check entirely by passing the literal string `"ignore"`, then runs `dpkg -i`/`bash` on the contents. Reachable via the same command channel as the credentials above - effectively arbitrary code execution for anyone who can reach it.
- **The hub's cloud-registration signing key is computable**, not a negotiated per-device secret (`MD5` of a fixed string plus the hub's hardware ID).
- **Three LAN-only HTTP surfaces** beyond one previously known: a diagnostics endpoint, a WiFi-configuration endpoint (likely used during AP-mode onboarding), and the actual Express mount point for the public API, none behind more than a hostname allowlist.

None of this was disclosed to YoLink, consistent with Part One's disclosure stance - presented here as neutral technical findings.

**ChirpStack, now definitively confirmed** (elevating the Part One §8 lead to a settled finding): the local config-file shape, the exact default MQTT topic convention, the gRPC auth JWT's audience/issuer claims, and an actively-used gRPC client managing ChirpStack Tenants/DeviceProfiles/Applications/Devices all point the same direction. Also newly traced: the complete LAN-vs-cloud bridging mechanism (why a bridged legacy P1605 hub's traffic never leaves the P1606 at all), confirmation that P1606 was built partly as a bridge for the prior hub generation, and resolution of the earlier "CSDevice" mystery (a generic passthrough handler for private-label/OEM devices, not a distinct product).

What's left, all outside `index.js` itself or requiring physical hardware: two separate firmware files (`gw_ap.sh`, Matter's `main.js`) not yet extracted into the repo; SQL schema-migration files bundled alongside the JS; and physical verification of the local MQTT broker's actual network exposure.

## 6. gaia/Ghidra tooling: Xtensa support claim corrected

The internal doc (`INSTRUCTIONS.md`) telling the Ghidra MCP tooling ("gaia") what firmware is loadable claimed stock Ghidra lacked Xtensa (ESP32) processor support - no longer true; stock Ghidra has shipped native Xtensa support for several releases. Corrected, with the real remaining gap now documented precisely: the ESP32 app image is a segmented format with non-contiguous virtual addresses, and gaia's `load_binary` only accepts one flat file at one base address - a preprocessing script or a per-segment loading tool is still needed before ESP32 firmware can be loaded through gaia the same easy way the sensor firmware already is. Until that's built, the manual GUI workflow documented in `ghidra_projects.md` remains the practical path for the ESP32 hub.

## 7. YL09 sensor firmware Ghidra analysis (task #19)

Directly continues Part One §9, which was left explicitly unfinished.

- **P0706 (V1.0): fully analyzed.** Every function in the firmware is now analyzed and exported. Confirmed P0706 is a **reed/door-switch sensor**. Major finds: a fully-mapped downlink command protocol (including an OTA-style block-transfer sub-protocol and a privileged provisioning/erase command), a wear-leveled flash journal, a complete LoRaMac-node-style software timer subsystem, a fully-named SX1276 radio driver, and a from-scratch AES implementation - full key schedule, ECB core, a complete AES-128-CMAC (RFC 4493) chain, and AES-CTR payload encryption, together forming the complete LoRaWAN encrypt+MIC pipeline. An MD5-based digest chain uses a non-standard seeded IV rather than the textbook MD5 constants, making the resulting digest device/key-specific by construction. Firmware strings show it's built from an ST vendor-SDK tree plus an app-specific layer, including a full AT-command table matching the debug-log format already known from a related sensor dump.
- **YS7704 (Vx.x): fully analyzed.** All 585 functions analyzed, renamed, and exported - hit and resolved the same interrupt-vector-table auto-analysis landmine as P0706 (bogus tiny functions decoded from raw vector-table bytes near the reset vector). Architecturally near-identical to P0706 function-for-function - same boot chain, crypto (AES/MD5), LoRaWAN MAC layer, SX1276 driver, flash journal, and AT-command engine - despite being a byte-different firmware build, confirming the two share a common vendor-SDK-plus-app-layer codebase rather than being independently written. One naming caveat worth keeping honest: a couple of legacy function names reference "UID" derivation but actually touch the STM32L0's option-byte region, not the genuine factory UID - flagged in comments rather than silently renamed, to avoid cross-reference churn.
- **YS7804 (V0464) and both YS8003 dumps (V0309, Vx.x): function-level analysis complete, findings write-up still open.** Per this repo's own tracker ([`FIRMWARE_ANALYSIS_PROGRESS.md`](../FIRMWARE_ANALYSIS_PROGRESS.md)), all three of these Ghidra projects are done and exported (`factory_state.gzf` sits next to each `factory_state.bin`) - but unlike P0706/YS7704 above, the results haven't yet been pulled back out into an architecture-summary/findings pass the way those two were. That's real remaining work, not just prose polish: is YS7804 (an "Outdoor Motion Sensor" per its FCC filing) built on the same shared codebase as the reed sensors, or does its PIR-specific logic diverge meaningfully? Does YS8003 - the one sensor in the lineup with an on-device LCD and a discrete STM32L073RBT6 instead of the integrated YL09 SiP - still share the same crypto/journal/radio-driver architecture despite the different chip package? Both are open questions until someone re-opens those two exported projects and reads back through what got named.

## Current status (as this document stands)

- Part One §1-2 are the only sections with real drafted prose; §3-13 remain outline-level notes, now updated in place with pointers to where the revival has already overtaken them (§9, §10, §12-13 most notably).
- Part Two is itself mid-stream: sensor-side (YL09-family) function analysis is now done across all five factory dumps (P0706, YS7704, YS7804, YS8003 V0309, YS8003 Vx.x), but YS7804/YS8003 still need their findings synthesized into prose the way P0706/YS7704 were; on the hub side, P1603 V1.0's `factory_state` build has analysis in progress (its separate, already-existing OTA-build project from Part One §7 is complete) and P1603 V2.4's `factory_state` hasn't been started; P1606's and P7805's FCC IDs are still unresolved; and the local MQTT broker's real-world network exposure still needs a physical hub to check.
- Whether Part One's §12 "rug pull" framing needs to change now that the project has demonstrably continued past its own ending is an open question for whoever drafts that section for real - this document takes no position on it, just notes the tension.

---

# Appendix: Production Notes & Backlog

*(Preserved from the original outline and working-notes files, for whoever picks up drafting next.)*

## Format decisions (confirmed, still in effect)
- One long-form document, not split into multiple posts, written for a wide range of reader expertise via the primer-box convention.
- First-person, conversational voice in narrative sections; primer boxes stay plain/dry by contrast.
- Timeline deliberately abstract/relative for Part One (no firm dates - the exact timeline isn't reliably remembered); Part Two, being recent, can use real relative dates ("August 2026").
- Disclosure stance: none of the mildly sensitive findings from either part (unauthenticated config/diagnostic endpoints, hub relaying all LoRa traffic regardless of account, the onboarding-key near-miss, the Hub 4 security findings) were ever reported to YoLink. Present as neutral technical findings, no disclosure narrative.
- Scope honesty: more physical devices were analyzed over the years than are represented in the repo or this document - say so plainly rather than implying completeness.

## Backlog / still to do
- Pull in more real images wherever they'd illustrate the text (sensor internals especially - the hub images are already in place in §3).
- Separate the hub analysis portion by specific hub/process if it grows further (big hub first, then smaller hub) once §5-8 get drafted into real prose.
- Links needed: the original Ghidra/ESP32 blog posts (already referenced inline in §7), Amazon product links for tools used (serial interface, JTAG interface, logic analyzer, Orange Pi CM).
- Topics mentioned but never written up: trying to find the ESP32 `hal.c` file specifically, OpenMQTTGateway as a point of comparison, Heltec/RNode devices for independently monitoring LoRa traffic, ESPHome (with a mention of a community tutorial on the Emporia Vue 2 as prior art for a similar onboarding-sniffing approach).
- Open question for §2/Part Two §2: is there a specific patent or FCC-filing detail that changed a real purchase decision worth calling out as a concrete anecdote, or is the general-principles treatment enough as written?
- Section 3's "dev unit" hub identity (tentatively P1605) should be double-checked before publishing, per the note left in §3 above.
- Whether Part One §12's ending needs to be reframed now that the project has continued past it (see "Current status" note at the end of Part Two) - unresolved, flagged for whoever drafts that section.
- Part Two §7's YS7804/YS8003 findings still need writing: re-open the exported `.gzf` Ghidra projects for those three dumps and pull out the same kind of architecture summary P0706/YS7704 already got, including whether YS8003's discrete-STM32L073RBT6 design (no YL09 SiP) actually diverges from the shared codebase or just repackages it.

## Reference material
- [`testing_methodology.md`](testing_methodology.md) - full test plan behind the §11 findings.
- [`ghidra_projects.md`](ghidra_projects.md) - Ghidra project setup steps for both the ESP32 hub and the YL09 sensor chip.
- [`references/`](references) - the two Olof Astrand Medium articles referenced in §7.
- Top-level [`README.md`](../README.md) - repo tour / how to reproduce.
- [`../INSTRUCTIONS.md`](../INSTRUCTIONS.md) - the current, authoritative source of truth for what's loadable into Ghidra today (supersedes any loading instructions implied above).
