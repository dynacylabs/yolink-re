# HANDOFF

Running, chronological record of everything worked on in this session. Written so work isn't lost between sessions and so the eventual blog post/writeup has a complete record to draw from. Updated on request throughout the rest of this session — nothing gets left out.

---

## 1. Repo consolidation: `yolink` + `yolink_re` → `yolink-re`

**Starting state:** two separate, overlapping repos existed locally (`yolink`, cloned Feb–Mar 2025 era commits; `yolink_re`, Jan 2024 era commits, older/less-reorganized), plus a third repo `yolink-re` that existed on GitHub but was completely empty (no commits, just a remote configured). The two source repos had a lot of duplicate content — same firmware dumps under different directory names, same PDFs, same images — because `yolink` was effectively a reorganized continuation of `yolink_re`'s work, but neither fully superseded the other (each had unique content the other lacked).

### Decisions made (via user Q&A)
- **Git history:** fresh history in the new repo, not a merge of both repos' full histories. `yolink_re`'s `.git` was 898MB (binaries committed directly, no LFS); dragging that in wasn't worth it. Old repos stay on GitHub as archives.
- **Submodules:** all 9 "repos of interest" become direct submodules of `yolink-re`, *except* `yolink_re` itself (that's a source repo being merged in, not a submodule target). User's explicit instruction: dedupe nested submodules — "no reason to have 3 submodules where submodule a and b both reference repo c."
- **Ghidra handling:** `yolink_re` referenced a full Ghidra-fork submodule (`git@github.com:dynacylabs/ghidra.git`, ~20GB per old README). `yolink` had replaced this with a `tools/ghidra_tools/download_ghidra_tools.sh` script. Read that script — it just clones the 9 tool repos, doesn't touch actual Ghidra. Decision: drop the full Ghidra submodule, keep the lightweight-tooling approach, but ultimately replace the *script* itself with direct git submodules (see below) since that's more correct/less redundant.

### Investigating nested-submodule duplication
Cloned (blobless, `--filter=blob:none`) all "repos of interest" to check for submodules-within-submodules that would cause triplicate checkouts:
- `esp-idf_rizzo` → submodule `ghidra-rizzo`
- `esp-idf_gdt` → submodule `ghidra-gdt`
- `ghidra-esp32-flash-loader` → submodules `data/svd` (espressif/svd, external) and `ghidra_scripts` (which itself points at the `ghidra-svd-loader` repo URL despite the path name)
- A separate top-level repo `ghidra_scripts` (referenced in the old download script but not in the "repos of interest" list) turned out to be just a wrapper bundling `ghidra-gdt` + `ghidra-rizzo` + `ghidra-svd-loader` as submodules — redundant once those three are vendored directly. Dropped.

**Fix:** document that cloning must use `git submodule update --init` (non-recursive), not `--recurse-submodules` — this avoids ever checking out the nested duplicate copies. Documented prominently in the top-level README and `tools/ghidra/README.md`.

### File-level deduplication
Computed MD5 checksums of every file in both `yolink` and `yolink_re` (excluding `.git`), found 34 files with identical content living at different paths across the two repos (firmware dumps, PDFs, SVDs, `esp32_rom.elf`, etc.). Merged directory structures per-device, keeping one copy of each duplicate and the *union* of unique analysis artifacts from both sides (e.g. `yolink_re` had a real Ghidra project — `.gpr`/`.rep` — for the P1603 mini hub's OTA firmware that `yolink` didn't have; `yolink` had more devices and more current directory naming that `yolink_re` didn't have).

After building the merge, verified via hash comparison that every file from both source repos was represented somewhere in the new tree (only genuinely-superseded or empty files were intentionally dropped — e.g. an empty `screenlog.0`, the messy self-duplicated `docs/need_to_organize.md`).

### Final structure adopted
```
yolink-re/
├── chips/          # P0603, YL09 — shared components across multiple products
├── hubs/           # P1603 (V1.0 mini + V2.4 big), P1604, P1605, P1606
├── sensors/        # P0706, P7805, YS7704, YS7804, YS8003
├── docs/           # writeup/, testing_methodology.md, ghidra_projects.md, references/
├── reference_data/ # esp32.svd, esp32_rom.elf, rkbin/ (submodule), datasheets/
├── tools/          # ghidra/, esp-idf/, esp32_image_parser, rkdeveloptool, fccid_downloader, scripts/
└── fcc_filings/     # added later, see §2
```

### Submodules added (final list, 11 total)
| Path | URL | Notes |
|---|---|---|
| `reference_data/rkbin` | `rockchip-linux/rkbin` (external, https) | |
| `tools/ghidra/processors/ghidra-xtensa` | `dynacylabs/ghidra-xtensa` | |
| `tools/ghidra/extensions/ghidra-esp32-flash-loader` | `dynacylabs/ghidra-esp32-flash-loader` | |
| `tools/ghidra/scripts/ghidra-rizzo` | `dynacylabs/ghidra-rizzo` | |
| `tools/ghidra/scripts/ghidra-gdt` | `dynacylabs/ghidra-gdt` | |
| `tools/ghidra/scripts/ghidra-svd-loader` | `dynacylabs/ghidra-svd-loader` (https) | |
| `tools/esp32_image_parser` | `dynacylabs/esp32_image_parser` | |
| `tools/esp-idf/esp-idf_elfs` | `dynacylabs/esp-idf_elfs` | **Registered as a bare gitlink (mode 160000) via `git update-index --add --cacheinfo`, not a real clone** — repo is 14GB+, cloning it would have consumed the whole session's disk/time budget. Same trick used for the next two. |
| `tools/esp-idf/esp-idf_gdt` | `dynacylabs/esp-idf_gdt` | Same bare-gitlink trick (1.7GB) |
| `tools/esp-idf/esp-idf_rizzo` | `dynacylabs/esp-idf_rizzo` | Same bare-gitlink trick (3.4GB) |
| `tools/rkdeveloptool` | `rockchip-linux/rkdeveloptool` (external, https) | See below — this one needed real investigation |

**`rkdeveloptool` problem and resolution:** `yolink/.gitmodules` referenced `git@github.com:dynacylabs/rkdeveloptool.git`, which returned "Repository not found" over both SSH and HTTPS, and 404 from the GitHub API — confirmed genuinely gone/never existed, not a permissions issue (same SSH key worked fine for every other private `dynacylabs` repo). Searched GitHub's public API for all of `dynacylabs`'s public repos — no `rkdeveloptool` there either. Fetched Radxa's own docs (`docs.radxa.com/en/zero/zero3/low-level-dev/rkdeveloptool`), which explicitly say `git clone https://github.com/rockchip-linux/rkdeveloptool`. Asked the user: fork it into `dynacylabs` first, or point directly at upstream (matching the existing precedent of `rkbin` also pointing directly at `rockchip-linux` without a fork). **User chose: point directly at upstream.** Done.

### Docs written/updated
- Top-level `README.md` — project overview, cloning instructions (with the non-recursive-submodule warning front and center), structure map, FCC background link.
- `.gitignore` — carried forward the P1606 firmware-image ignore rule from the old repo, added generic Python/OS ignores.
- `tools/README.md`, `tools/ghidra/README.md` — explain the large-submodule situation and the nested-submodule trap.
- `hubs/README.md`, `hubs/P1603/README.md` + per-version READMEs, `hubs/P1604`, `hubs/P1605`, `hubs/P1606` (+ `V1.0/README.md`) — device-level docs including WiFi defaults, debug header pinouts, hub behavior notes (LoRa→MQTT relay confirmed for all sensors regardless of account).
- `sensors/README.md` + per-device READMEs (`YS7704`; others got theirs added later during the FCC pass).
- `chips/README.md`, `chips/YL09/README.md`, `chips/P0603/README.md`.
- `docs/README.md`, `docs/writeup/writeup.md` (cleaned up from the original brain-dump, image links fixed to point at real repo paths), `docs/writeup/image_tables.md` (same), `docs/testing_methodology.md`, `docs/ghidra_projects.md` (paths fixed to match new tool locations).
- `reference_data/README.md`.

**Commits:**
- `44bce2c` (2026-07-22) — "Consolidate yolink and yolink_re into a single organized repo" — 181 files.
- `8fe50cb` (2026-08-03) — "Pushing draft and outline" — the writeup outline/draft (see §6), pushed in an earlier separate working session before this one picked back up.

---

## 2. FCC filings, device identification, and chip identification

### Getting the FCC ID → device mapping right
Started by sending the user 8 photos (labeled 1–8) of devices already in the repo, asking them to match each to an FCC ID. Ran an initial fccid.io search that produced *candidate* (unverified) guesses. Over several exchanges, the user corrected/confirmed the real mapping:

| Device | FCC ID | How it was confirmed |
|---|---|---|
| P1603 V1.0 (mini) + V2.4 (big) | `2ATM71603M` | User confirmed big hub = this ID; user separately confirmed mini hub shares the same filing as big hub (same electrical design, different enclosure — no re-filing needed) |
| P1604 (speaker hub) | `2ATM71604` | User confirmed directly |
| P1605 | `2ATM71605` ("Hub 3") | User confirmed; later this pairing needed correcting (see §3) |
| P1606 | *(none found — see §4)* | Originally miscategorized as also `2ATM71605`; corrected in §3 |
| P0603 | none | User confirmed no independent FCC ID (daughter board, not separately certified) |
| P0706 | `2ATM77704` ("Door Sensor") | User confirmed |
| YS7704 | `2ATM77704` (same as P0706) | User confirmed — P0706 is the board underlying the YS7704 product |
| YS7804 | `2ATM77805` ("Outdoor Motion Sensor") | User confirmed |
| YS8003 | `2ATM78003` ("Temperature Humidity Sensor") | User confirmed — matched an earlier candidate guess |
| P7805 | *(guessed `2ATM77804`, later disproven — see below and §4)* | |

**The P7805 mistake and correction:** Initially guessed `2ATM77804` for P7805 based on the numeric similarity (`7805` appearing in both) and the fact both are round PIR-based motion sensor designs. User initially said "confirm P7805," accepting the guess. When the actual filing's internal photos were pulled and examined, the board was clearly silkscreened `P7804-UC_V0.3 / 20190907` — a *different* board than P7805 (which is silkscreened `P7805_Main_V1.1` / `P7805_SENSOR_V1.1`, dated `2023.08.11`). Caught and corrected this before it propagated further: `2ATM77804` belongs to a device called P7804 that isn't otherwise in this repo; **P7805's real FCC ID is still unknown** (see §4 for the full search effort).

### `fccid_downloader` tool
User has a personal tool for this, `dynacylabs/fccid_downloader` (initial guess at the name, `fcc_downloader`, was wrong — corrected by the user). Added as a new submodule at `tools/fccid_downloader`. Python 3 + `requests` + `beautifulsoup4` (dependencies weren't installed; installed them). Usage: `python tools/fccid_downloader/fccid_downloader.py <FCC_ID> [FCC_ID...] -o <dir> -d <delay_secs>`.

Ran it for all 7 confirmed FCC IDs at once (`2ATM71603M 2ATM71604 2ATM71605 2ATM77704 2ATM77805 2ATM78003 2ATM77804`) — **79 files downloaded, 0 failed, ~69MB total.** Output included, per FCC ID: Internal Photos, External Photos, Users Manual, Test Report, Test Setup Photos, Cover Letter(s), and (where present) Attestation Statements, RF Exposure Info, ID Label/Location Info.

### Repo reorganization for FCC content
Created a new top-level `fcc_filings/<FCC_ID>/` directory (one per FCC ID, not per device — since several FCC IDs cover more than one device directory, e.g. `2ATM71603M` covers both P1603 revisions, `2ATM77704` covers both P0706 and YS7704). Each filing directory holds:
- The raw downloaded exhibits, organized in their original per-category subfolders.
- `chip_identification.md` — written from the Internal Photos exhibit.
- `images/` — cropped, sometimes upscaled/sharpened close-ups of individual identified chips.

Removed 4 now-redundant standalone `fcc_internal_photos.pdf` files that existed in device directories from the original repo merge (`hubs/P1603/V2.4`, `hubs/P1604/V2.2`, `sensors/YS7704`, `sensors/YS8003`) — their content is superseded by the fresh, complete download. Before deleting, diffed page counts old-vs-new: three matched exactly; `sensors/YS8003`'s old file had 4 pages vs. the new download's 3 — the extra page was a genuinely unique photo (a P0706-board close-up, apparently miscategorized under YS8003 in the original hand-curated PDF). That one page was extracted and preserved as `fcc_filings/2ATM78003/images/bonus-p0706-board-photo.png` before the old file was deleted.

Updated every affected device's `README.md` to link to its FCC filing and chip-ID doc. Added new `README.md` files for devices that didn't have one yet (`sensors/P0706`, `sensors/P7805`, `sensors/YS7804`, `sensors/YS8003`). Wrote `fcc_filings/README.md` as a top-level index with a filing → device table.

### Chip identification methodology
For each filing's Internal Photos PDF: rasterized with `pdftoppm` (started at 200dpi, went up to 1200dpi for chips with small print), cropped candidate chip regions with Python/PIL, viewed the crops, read the printed part markings directly off the chip packages. Iterated crop coordinates by eye (several misses/retries per chip — documented here so the *method* is understood, not just the result). Where a marking was genuinely too out-of-focus in FCC's source photo, confirmed this by re-cropping at much higher DPI with `ImageFilter.UnsharpMask` + contrast enhancement, and only then wrote it up as unresolvable (not just "didn't try").

### Chip identification results, by filing

**`2ATM71603M` — P1603 (both mini and big hub, one filing):**
- **Espressif ESP32-D0WD-V3** — main SoC. Marked `ESP32-D0WD V3 / 152022 / UE00PNA077`. This filing's photos included hand-annotated "LoRa Antenna" / "WiFi Antenna" callouts, which made everything else easier to place.
- **Semtech LLCC68** — LoRa radio. Marked `LLCC68 / LoRa® / 2230 / 19704`.
- External SPI flash marked `25VQ32BSIG / HD2133 / P2U292` — manufacturer prefix not fully legible; closest identified family is GigaDevice's GD25Q32/GD25VQ32 line.
- **HanRun HR913550A** Ethernet magnetics/RJ45 jack, marked `HanRun / HR913550A / 2236`. *(Corrected later in the session — originally misread as "HR911550A"; see §4.)*
- One small QFN near the ESP32 module: **not identified** — re-examined at 1200dpi with sharpening, genuinely out of focus in the source photo, not a resolution problem on this end. Plausibly a PMIC based on position/passives, unconfirmed.

**`2ATM71604` — P1604 (speaker hub):**
- **Espressif ESP32-WROVER-E module** (not a bare chip like P1603 — this variant includes onboard PSRAM, presumably for audio buffering). Marked `ESPRESSIF ESP32-WROVER-E`.
- Inside the module (photographed with the shield can removed): **ESP32-D0WD-V3** (`282021 / UE00P4P654`, same silicon as P1603), **GigaDevice GD25Q64E** SPI flash (`25Q64ESIG / C005806 / RJ2126`, 64Mbit — double P1603's flash capacity), **Espressif PSRAM64H** (`182021 / 1500056`, 64Mbit).
- **Semtech LLCC68** again (`1951 / 73124`) — confirms YoLink standardized on this part across at least two hub generations.
- Audio amplifier/speaker driver chip: **not identified**. Two SOIC-8 packages near the WROVER module are the likely candidates; neither has a legible marking even at 1200dpi with sharpening — confirmed genuinely out of focus, not unresolved-by-neglect.

**`2ATM71605` — "Hub 3" (P1605 *only* — see §3 for why not P1606):**
- **MediaTek MT7628NN** main SoC — a MIPS-based WiFi router SoC, a completely different architecture from the Xtensa ESP32 used in P1603/P1604. Marked `MEDIATEK / MT7628NN / 2503-AF34` (last line partially legible). Paired with a Winbond-branded package (likely flash or DRAM, exact part not legible).
- Board silkscreen: `P1605_V1.3, 2024.01.30`.
- Notable extras not seen on the ESP32 hubs: a bare 18650 Li-ion cell (EVE `ICR18650/26V`, 2.55Ah) for battery backup; on-board silkscreened `ATE`/`DEBUG` header rows (no need to hunt for test points); antenna callouts for `923.3Mhz Antenna` plus *two* separate `WIFI 2.4G` antennas (A and B).
- Product label photo confirms: `YOLINK Hub 3, Model: YS1605-UC, FCC ID: 2ATM71605`.
- LoRa radio lives on a **separate small daughter card**, not the main MediaTek board. Likely LLCC68 by pattern (YoLink used it on both other hubs), but the chip package shows *no legible marking at all* even at 1200dpi, and the daughter card's own silkscreen text is too blurred to read either. Confirmed unresolvable from these photos.

**`2ATM77704` — "Door Sensor" (covers both P0706 and YS7704, one filing):**
- **YoLink YL09** — marked `YOLINK / YL09 / 291502 / 1913`. This is the cleanest, clearest photo of the YL09 chip obtained all session — good enough that a copy was pulled into `chips/YL09/images/` as the first locally-hosted real photo of the chip (previously only externally-hosted diagram links existed there).
- Board silkscreen: `YS7704-CE DoorSensor_2 / Ver: 0.2 / 20190423`.
- No other notable chips — minimal single-SiP design.

**`2ATM77804` — "Motion Sensor" (turns out to be board P7804, not P7805 — not otherwise in this repo):**
- **YoLink YL09** again, marked `YOLINK / YL09 / 291502 / 1913` — *identical lot/date code* to the one on the Door Sensor filing, suggesting both products drew from the same manufacturing batch.
- Board silkscreen: `P7804-UC_V0.3 / 20190907`. This is the filing that revealed the P7805 mix-up.

**`2ATM77805` — "Outdoor Motion Sensor" (= YS7804):**
- **YoLink YL09** confirmed, though the exact lot code wasn't fully legible (dark blue soldermask gave much lower contrast than the green boards used everywhere else, making this one harder to photograph/read).
- Weatherproof enclosure, two-board design (PIR sensor board + main/radio board on a ribbon cable) — similar general architecture to P7805, but a distinct product.

**`2ATM78003` — "Temperature Humidity Sensor" (= YS8003):**
- The one sensor in the whole repo that does **not** use YL09. Instead: discrete **STMicroelectronics STM32L073RBT6** (`STM32L / 073RBT6 / GQ23E VG / CHN GQ 803`, with the ST logo — same STM32L0 core family that's *inside* the YL09 SiP, just used here standalone) plus a separate **Semtech SX1276** LoRa radio module (`SX1276 / 1818 / 186817`, on its own daughter board silkscreened `SX1276 V2.6`). SX1276 is the older/higher-end sibling to LLCC68 — this filing is dated 2019, the earliest of the sensor filings gathered, consistent with it predating YoLink's apparent later standardization on LLCC68.
- Has an LCD display (board+LCD both silkscreened `YS8003-UC_V1.0`) — the only sensor in the current lineup with an on-device readout.

### Datasheets
Saved to `reference_data/datasheets/`, one file per unique chip (not duplicated per device), cross-linked from every `chip_identification.md` and device README that uses that chip.

| File | Chip | Source that actually worked |
|---|---|---|
| `esp32-datasheet.pdf` | ESP32-D0WD-V3 (series datasheet) | SparkFun mirror |
| `semtech-llcc68.pdf` | LLCC68 | GitHub raw mirror (`libdriver/llcc68`) — Mouser and alldatasheet.com both blocked scripted downloads (returned HTML/bot-check pages, not the PDF) |
| `semtech-sx1276.pdf` | SX1276 | SparkFun mirror (Semtech's own `semtech.com/uploads/documents/...` URL also returned HTML, not PDF) |
| `espressif-psram64h.pdf` | PSRAM64H | Adafruit mirror (Espressif's own official URL also blocked) |
| `gigadevice-gd25q32c.pdf` | GD25Q32C | Octopart direct PDF host — closest available match for P1603's `25VQ32BSIG`-marked flash; exact low-power "V" variant datasheet not confirmed identical |
| `mediatek-mt7628nn.pdf` | MT7628NN | Seeed Studio mirror |
| *(none — already in repo)* | STM32L073RBT6 | Already present at `chips/YL09/stm32L073xZ/stm32l073v8.pdf` from the original repo merge — covers the whole STM32L073x8/xB/xZ family |
| `gigadevice-gd25q64e.pdf` | GD25Q64E (P1604's flash) | **Found in the gap-closing pass (§4)**, not on the first attempt — see below |
| `hanrun-hr913550a.pdf` | HanRun HR913550A (P1603's Ethernet magnetics) | **Found in the gap-closing pass (§4)**, after correcting the part-number misread |

**General lesson learned this session on datasheet sourcing:** most electronics-distributor sites (Mouser, LCSC's page itself, TME, Sekorm, GigaDevice's own site) either require login or actively block scripted `curl` downloads (return an HTML bot-check page with a `200` status instead of the actual PDF — always worth checking `file <output>` after downloading, not just the HTTP status code). What reliably worked: GitHub-raw mirrors of hobbyist driver-library repos, SparkFun/Adafruit's own CDN mirrors, Octopart's direct PDF host, and — most productively — **JLCPCB's part-detail pages**, which embed a live, signed Aliyun OSS CDN URL for the datasheet that a plain `curl` *can* fetch, as long as it's used within roughly 30 minutes of being generated (the signature expires).

**Commit:** `1b6c005` (2026-08-10 14:38) — "Add FCC filings, chip identification, and datasheets" — 134 files.

---

## 3. Resolving the P1605 / P1606 architecture conflict

Before pushing the FCC-filing commit, the user asked to investigate a self-flagged conflict: the chip-identification work found `2ATM71605` ("Hub 3") to be MediaTek MT7628NN-based, but this repo's existing (pre-session) documentation for P1606 — written from actual hands-on flashing work — describes a Rockchip SoC accessed via `rkdeveloptool` in Maskrom mode. MediaTek MT7628 and Rockchip are unrelated chip families; one board can't be both.

**Investigation:** read `hubs/P1606/V1.0/serial/uart_debug_1500000_power_on.log` (135 lines) closely. Found:
- A long LPDDR4 DDR-training sequence (per-byte-lane DQS read/write training, CA training) — the exact shape of Rockchip's SPL DDR-init output, not something a MIPS router SoC like MT7628 (no LPDDR4 support) would ever produce.
- `INFO: Preloader serial: 2` — Rockchip's own proprietary preloader terminology.
- `NOTICE: BL31: v2.3()...` / `INFO: GICv3 without legacy support detected.` / `INFO: ARM GICv3 driver initialized in EL3` — **ARM Trusted Firmware** boot stages (BL31, EL3, GICv3) that only exist on 64-bit ARMv8-A silicon. MediaTek MT7628 is 32-bit MIPS and has no concept of ARM exception levels or GICv3 at all — it is architecturally impossible for that chip to produce this log.
- Login banner: `YS1606 login:` — confirms the hub's actual model number is `YS1606`, distinct from P1605's `YS1605-UC`.

**Conclusion:** P1605 and P1606 are two different devices that do not share an FCC filing. The earlier link (from earlier in this session, based on the user's recollection when reviewing photos) was a mistake. `2ATM71605` belongs to P1605 alone. P1606/`YS1606` is genuinely Rockchip/ARM-based as the pre-existing repo docs said, and its own FCC ID is still unidentified (see §4).

**Files updated:** `fcc_filings/2ATM71605/chip_identification.md` (added a resolution note with the log evidence), `hubs/P1605/README.md`, `hubs/P1606/README.md`, `fcc_filings/README.md`, `reference_data/README.md`.

**Commit:** `2484cc9` (2026-08-10 14:45) — "Resolve P1605/P1606 architecture conflict: separate devices, not one filing."

Then pushed both pending commits (`1b6c005` and `2484cc9`) to `origin/main` together, per the user's "commit and push" instruction that followed the conflict investigation.

---

## 4. Outstanding-items review, then an autonomous gap-closing research pass

User asked for a status check on open items. Compiled a list by grepping the whole repo for flag words (`still open`, `not yet`, `unconfirmed`, `not identified`, `not legible`, `never tested`, etc.) rather than relying on memory, to ground it in what was actually written down. Reported:
- Writeup only §1–2 of 13 drafted.
- P7805's real FCC ID unknown; P1606's FCC ID unknown.
- Several unidentified chips (P1603 QFN, P1604 audio amp, P1605 LoRa radio, YS7804's YL09 lot code).
- Two missing datasheets (GD25Q64E, HanRun magnetics).
- Testing/analysis follow-ups noted from the user's own earlier feedback: BLE onboarding theory never tested, YL09 sensor-side analysis needs to go deeper, the `ai_auto_analysis` script never run, Hub 4's JS never AI-restructured.

User then asked to fix what could be fixed autonomously, with research authorized. Created tasks 15–18 and worked through them:

### Chip re-examination (task 17)
Re-rasterized the three still-unidentified hub chips at up to 1200dpi with `ImageFilter.UnsharpMask` + contrast enhancement. All three (P1603's QFN, P1604's audio amp SOIC-8s, P1605's LoRa daughter-card chip) were confirmed **genuinely out of focus in FCC's source photographs** — not a rasterization ceiling on this end. Updated each `chip_identification.md` to say so explicitly, so nobody re-attempts the same dead end later.

### P1606/YS1606 FCC ID search (task 16)
Checked, in order: the full `2ATM7` grantee listing (60 filings, current through the day of the search — no `1606`-numbered entry); a direct URL guess at `fccid.io/2ATM71606` (300 Multiple Choices, no useful resolution); `fccid.io`'s own search for "YS1606" (no matches); `fcc.report`'s company page for YoSmart Inc. (same 60-filing list, no `1606`); a broader web search that surfaced `2AFK9KT-MC-U01B` ("YoSmart Hub" by KingTing Tech. Corporation) as a candidate — checked it directly and ruled it out (filed 2015, far too old, predates P1603 even existing); tried to pull the FCC compliance statement out of YS1606's actual user manual PDF (`yosmart.com/support/YS1606-UC/docs/instruction`) but the fetch tool couldn't extract text from that PDF viewer; tried the FCC's own official `apps.fcc.gov` search tool directly (403 Forbidden — needs a real browser session, not a simple fetch).

**Not resolved**, but a significant side-finding: **model `YS1606` is YoLink's current-generation "Local Hub"** — their actual shipping local-API, Matter-enabled product (`shop.yosmart.com/products/ys1606`). This is very likely connected to the writeup's planned ending ("YoLink shipped local control themselves, mooting the project") — worth confirming with the user whether the specific hardware in this repo is an early/dev unit of this same shipping product before that section gets drafted.

### P7805 FCC ID search (task 15)
Re-read the P7805 board photos closely to extract a manufacturing date code: `JUW7.820.10138812` / `...819 V1.0, 2023.08.11`. Used that to narrow the search to FCC filings from around August 2023. None of YoSmart's 2023-dated filings in the grantee list (`2ATM75001V2`, `2ATM75002`, `2ATM71603M`, `2ATM75709`, `2ATM75707`, `2ATM77107`) looked like a plausible match by product description. Directly downloaded and visually inspected the internal photos of the two most plausible remaining candidates:
- **`2ATM77201`** ("Vibration Sensor") — internal photos show a small rectangular board in a case molded `P7706`. Not P7805, not round/PIR-shaped. Ruled out.
- **`2ATM77107`** ("Outdoor Alarm Controller 2", model `YS7107-UC`) — internal photos show a C-cell-battery-powered siren/alarm unit. Unrelated. Ruled out.

**Not resolved.** Documented the full search trail (including the date-code narrowing approach) in `sensors/P7805/README.md` so a future attempt doesn't repeat this same ground. Also noted: P7805's board doesn't show a visible YL09 chip in the currently-available repo photos the way every other sensor does — worth a fresh close-up of the small QFN near its PIR element if the physical unit is ever revisited, since that would help both the chip-ID and (indirectly) narrow which FCC filing to look for.

### Remaining datasheets (task 18)
- **GD25Q64E:** every distributor-direct mirror failed the same way as before (GigaDevice's own site required login; LCSC, Mouser, TME, Sekorm all blocked scripted downloads). Found via **JLCPCB's part-detail page** (`jlcpcb.com/partdetail/2785742-GD25Q64ESIG/C2685734`), which surfaces a signed Aliyun OSS CDN URL that a fresh `curl` fetch can actually retrieve. Got a real 62-page PDF this way.
- **HanRun magnetics:** while re-checking, discovered the part number had been **misread earlier in the session** — the chip crop image actually reads `HanRun HR913550A`, not "HR911550A" as originally transcribed (easy mistake: 1↔3 at small size). Corrected the reading, renamed the cropped image file (`hanrun-hr911550a.png` → `hanrun-hr913550a.png`), and — because HR913550A is a real, well-documented part — found its datasheet immediately via the same JLCPCB CDN-URL trick.
- Updated `reference_data/datasheets/README.md`, `fcc_filings/2ATM71603M/chip_identification.md`, and `fcc_filings/2ATM71604/chip_identification.md` to reflect both fixes.

**Commit:** `59a2941` (2026-08-10 15:15) — "Close out remaining FCC/chip identification gaps." Pushed immediately after.

---

## 5. Task-list housekeeping

User asked for the current state of the task list; reported all 18 tracked tasks (repo consolidation + FCC/chip work) as completed, plus a plain-language summary of what remains untracked (writeup progress, the two unresolved FCC IDs, the testing/analysis follow-ups).

User then said to mark **YL09 sensor-side analysis** and **AI-assisted restructuring of Hub 4's JS** as the next two items to tackle. Created task #19 (YL09 analysis, still pending) and task #20 (JS restructuring, now in progress — see §6). Deleted the 18 now-stale completed tasks from the tracker to keep it current rather than cluttered.

---

## 6. Hub 4 (P1606) JavaScript investigation — in progress

Started on task #20 at the user's request ("take a look at the js, tell me what you think"). This is genuinely new analysis, not yet written up anywhere else in the repo — capturing it fully here.

### What was extracted
The only JS payload found in the repo is `hubs/P1606/V1.0/firmware/YS1606-UC_v0604/usr/lib/p1606/p1606mq-dev.tar.gz`. Extracted it: contains exactly two files, `index.js` (3.2MB, a single line — standard webpack/Terser bundle output) and `index.js.LICENSE.txt` (342 lines, webpack's auto-generated third-party license manifest).

### Key finding: it's minified, not obfuscated
Short variable names (`e,t,r,o,n,i,s,a,l,c,p`, standard Terser-style single-letter reuse) and everything collapsed to one line, but string literals, `require()`-style module references, and object property names are all intact and readable. No string encryption, no control-flow flattening. This matters a lot for the planned AI-restructuring task — it's the easy case.

### What's bundled (from the LICENSE manifest + grep counts)
The LICENSE.txt lists, essentially, the *entire* dependency tree of **Express.js** (`express`, `body-parser`, `send`, `serve-static`, `finalhandler`, `fresh`, `etag`, `range-parser`, `content-type`, `mime-types`, etc. — ~30 packages, all the usual Express internals) plus `ieee754`, `safe-buffer`, `long.js` (Daniel Wirtz), and a gRPC copyright notice (2018, Apache 2.0). Grepping the actual bundle for case-insensitive occurrence counts: `Express`-family terms ~33x, `grpc`-family terms ~158x, `mqtt`-family terms ~175x. Also found direct references to `redis` (the `node-redis` client, including its own GitHub issue-tracker URLs baked into an error message or two).

### Architecture, reconstructed from readable strings
This single Node.js app is a **supervisor/bridge process** that manages several other things running on the hub:

- **Express HTTP server** exposing at least `/api` and `/api/v1`, plus routes `/lcsubnet/dpf/devices` and `/subnet/devices` — almost certainly the actual implementation of YoLink's advertised "Local API" feature for this hub.
- **A local `loraserver` process**, managed like a system service: the code calls `service loraserver status`, `service loraserver restart`, and runs `loraserver --version` via shell `exec()` and parses the output with regex. Configuration is written to `/etc/loraserver/loraserver.toml` (note: `/etc/loraserver` and `${s}/current` symlink pattern both appear) with a `sqlite://` database path and a `network.net_id` field.
- **This is a real, current instance of the open-source LoRa Server / ChirpStack project**, not just LoRaWAN-adjacent homegrown code — confirmed two ways: (1) the `loraserver.toml` config shape (sqlite backend, `net_id` field) matches that project's actual config file format exactly, and (2) an MQTT topic string `application/+/device/+/event/up` appears in the bundle, which is ChirpStack's own default uplink-event topic convention, verbatim. This directly substantiates the "ChirpStack" hunch flagged earlier in this project's notes (see the writeup outline's "what the firmware and network analysis found" section) — now with hard evidence from the actual code, not just an external inference.
- **gRPC** is used as the transport to talk to the local `loraserver` instance: `getLoraServerConfig()` returns `{grpc: {url: process.env["lora.server.grpc.url"] || "localhost..."}}`, and there's a small client-factory function (`h(e,t)`) that creates gRPC service stubs with `ChannelCredentials.createInsecure()`.
- **Redis** is bundled, presumably for local state/caching between the Express layer and whatever else needs shared state.
- **MQTT** (client library, ~175 case-insensitive hits) ties the local loraserver's uplink events to... something — likely bridging to the cloud (`https://us.yosmart.com`, found hardcoded as a string literal) and/or to a local broker for the Express API to consume.
- A custom internal task-runner abstraction is visible too: `app.addTask("onInit", new n.YLTask("Check Local LoraServer", ...))` — "YLTask" (YoLink Task) appears to be their own lightweight scheduler/init-task framework layered over all of this.

### A finding that needs care before saying anything definitive
Two hardcoded-looking credential strings turned up in the same region of code as the loraserver config:
```
{loraserver:{password:"c43af48c-0ade-6199-537a-a2df325564b0"}, integration:{password:"5299b6..."}}
```
Not yet determined whether these are (a) genuinely static/shared secrets baked into the shipped firmware, or (b) placeholder/example values that get overwritten per-device at provisioning time, or (c) something else. Flagged to the user directly rather than asserting either way. **This needs a careful look before it goes in the writeup or gets treated as a "finding."**

### Where this was left off
User was given this assessment and asked whether to (a) proceed with an AI-assisted restructuring pass now — recommended scoping it to just the app-specific modules and skipping the well-known vendor libraries (Express/gRPC/MQTT.js/Redis client), since those don't need renaming — or (b) look at the credential strings more closely first. **No decision made yet as of this handoff being written.** Task #20 is still marked in-progress.

---

## 7. Writeup / blog post status

Separate from the technical repo work, a long-form narrative writeup has been in progress. Current state:

### Format decisions (all confirmed with the user)
- **One long-form document**, not split into multiple posts. Written for a very wide range of reader expertise — primer boxes explain background concepts (LoRa, Ghidra, MITM proxying, etc.) in plain language with a "skip to" pointer, so experienced readers can jump past what they already know without the piece being unreadable to lay readers.
- **Voice:** first-person, conversational, in the narrative sections specifically — jokes/frustration/asides welcome. Primer boxes stay plain/dry by contrast.
- **Timeline:** deliberately abstract/relative, no firm dates (the user isn't confident of the exact timeline). The project was multi-year and on-and-off; the user's son was born somewhere in the middle of it, which is being used as an honest, relatable marker of how stretched-out the effort really was — this detail is *intentionally* being included at the user's request.
- **Ending:** the project didn't get "finished" — it wound down because YoLink shipped an official local-control feature themselves before the from-scratch RE effort got there. This is being framed honestly as a bit of a rug-pull / anticlimax, not spun as a win. (See §4/§6 above — the `YS1606` "Local Hub" discovery may be directly relevant to how this section actually gets written, since the hub in this repo may be an early unit of the very product that mooted the project.)
- **Disclosure stance:** none of the mildly sensitive findings (unauthenticated hub-config endpoint, hubs relaying all LoRa traffic regardless of account, the near-miss on onboarding encryption keys) were ever reported to YoLink. These get presented as neutral technical findings in the writeup — no disclosure narrative, no claims about anything being fixed.

### Outline
13 sections, in `docs/writeup/outline.md`. Order was explicitly revised once already: the "hub is just a dumb relay" pivot (originally section 8) was moved earlier, to right after the initial serial/flash recon and *before* the deep Ghidra-tooling-pipeline section, so the pipeline-building work reads as a deliberate (if slightly stubborn) choice made in spite of already suspecting the hub wouldn't be that interesting — rather than a contradiction discovered after the fact.

Current section order:
1. Introduction / Motivation
2. Research Before You Buy: OSINT, Patents, and FCC Filings
3. Hardware Survey
4. Setting Up a Reverse-Engineering Lab
5. Getting a Foothold: Serial and Flash
6. The Pivot: Realizing the Hub Is Just a Dumb Relay
7. Standing Up a Ghidra Workflow for ESP32 (the deep dive)
8. What the Firmware and Network Analysis Found
9. Going Deeper on the Sensors
10. Hub 4: The Weird One Out
11. Testing the Theories
12. The Rug Pull: YoLink Ships It First
13. What Actually Came Out of This (the real payoff)

Also folded in, per later user feedback, a long list of specific anecdotes/details that must appear somewhere in the eventual draft (captured in the outline in detail, summarized here for completeness):
- ChirpStack usage (now substantially *more* confirmed than when this note was first added — see §6).
- Almost recovered the encryption keys used in initial device onboarding (a near-miss, not a win).
- The property's long/narrow layout and why it created specific range constraints (this actually made it into the drafted §1 already, see below).
- Hub 4 runs a JS app with all its logic in it (now substantially explored — see §6).
- Purchased an Orange Pi CM (Compute Module) dev board specifically to desolder a YL09 chip and re-host it for dedicated analysis.
- Set up a Raspberry Pi as a dedicated RE lab workbench.
- Used `mitmweb` to sniff hub-to-cloud traffic.
- Analyzed more physical devices over the years than are represented in this repo or will make it into the writeup — stated explicitly rather than implying completeness.
- Only ever found one device with actually-exposed/accessible debug headers for the YL09 chip itself.
- Heavy reliance on OSINT/patents/FCC filings before buying "sacrificial" hardware, which helped avoid wasted purchases.
- Images from the repo should be pulled into the writeup wherever they illustrate the text, rather than describing boards in prose alone.
- The "prematurely listed hub" story: YoLink briefly listed a new hub for sale before it was ready — only 3 units existed, built for their own developers. The user ordered fast enough to catch the listing; YoLink offered a refund instead of shipping, the user asked for the device anyway, and YoLink actually shipped one of the 3 dev units. Believed (per the outline's own production note) to be "Hub 3"/P1605 — **this should be double-checked against the FCC-confirmed fact that P1605's actual retail FCC ID (`2ATM71605`) exists and is a normal filing, which is slightly in tension with "only 3 units ever existed" — worth reconciling before this goes in the final draft.** Possibly the dev unit predates the later full retail release/filing.
- Eventually realized the hub is just a dumb relay (LoRa↔IP) and the real interesting logic is probably in the sensors — this insight is what justified reordering the outline (see above).
- Sensor-side (YL09) analysis needs to go deeper than what currently exists — this is now task #19, next up.
- If continuing the project, next technical step would have been running a personal `ai_auto_analysis` script across all collected firmware images — the user noted they might still do this "for fun/documentation" even without resuming the full project.
- Idea: run Hub 4's deminified-but-unrestructured JS through an AI tool to recover meaningful names/structure — this is task #20, actively being worked (§6).

### Draft
`docs/writeup/draft.md`, written in order against the outline. Currently contains, in full prose (not outline bullets):
- **"How to Read This Document"** — explains the primer-box convention.
- **§1, Introduction/Motivation** — fully drafted and revised per user corrections. Key facts locked in: three **solar parking-lot lights** (not "flood lights" as first drafted), split-type/panel-separate-from-head design, IP66-rated, bought as a lot at **auction**, in acceptable-but-used condition, intended to go around a **pond** so the user's family could fish it at night. Property is long and narrow; the pond sits **300–400 feet** from the house (corrected from an initially-misremembered "couple hundred feet"). Real product links included: the [YoLink Smart IR Remote](https://www.amazon.com/gp/product/B0824FF9Y5) (confirmed via product-page fetch to be the actual YoLink IR-blaster sensor — the user's first pasted link, mistakenly pasted twice, was corrected) and the actual [parking lot lights](https://www.amazon.com/gp/product/B0CQM577YH) (a second link the user supplied after the mixup was caught). Includes a primer box on LoRa vs. WiFi/BLE/Zigbee tradeoffs.
- **§2, Research Before You Buy: OSINT, Patents, and FCC Filings** — fully drafted. Covers the FCC-filing research strategy (grantee code `2ATM7`, `fccid.io/2ATM7`) and patent research as pre-purchase due diligence, tied to the real `fcc_internal_photos.pdf`-derived files that ended up in the repo (now superseded by the much more thorough `fcc_filings/` work done later in this session — worth updating this section's framing slightly to reflect how much deeper that research went, when this section gets revisited).

**Not yet drafted:** §3–13. The user paused writing to focus on the repo/chip-ID work and hasn't resumed as of this handoff.

**Open question for §2 specifically**, never answered: whether the user has a concrete anecdote (a specific patent or FCC detail that changed a real purchase decision) to include, or whether the current general-principles treatment is fine as-is.

---

## 8. Current repository state (as of this handoff)

- **Branch:** `main`, pushed and in sync with `origin` (`git@github.com:dynacylabs/yolink-re.git`) through commit `59a2941`.
- **Working tree:** clean as of the last commit; the only session activity since then is the read-only JS extraction/investigation in §6 (extracted to `/tmp/p1606_extract`, *not* copied into the repo yet — nothing to commit there until a decision is made on how to formally document/restructure it).
- **Task tracker:** task #19 (YL09 sensor-side analysis) pending; task #20 (Hub 4 JS restructuring) in progress, paused awaiting user input on scope/next step (full restructuring pass vs. resolving the credential-string question first).
- **This file** (`HANDOFF.md`) sits at the repo root, **untracked** — not yet committed. (Deliberately left uncommitted pending user instruction — this is a working/scratch document per the user's framing ("will eventually make it into the final doc"), not obviously part of the permanent repo history. Flag if it should be committed or gitignored.)

---

## 9. Straight-up open items list (for quick reference)

1. Decide next step on Hub 4 JS: full AI-restructuring pass now, or resolve the two hardcoded-looking credential strings first.
2. YL09 sensor-side deep-dive analysis (task #19) — not started.
3. P7805's real FCC ID — unresolved despite a real search effort; documented trail in `sensors/P7805/README.md`.
4. P1606/YS1606's real FCC ID — unresolved; documented trail in `hubs/P1606/README.md`. Tied to the "this might be the Local Hub" finding, which itself needs the user's confirmation/memory check.
5. Reconcile the "only 3 units of Hub 3 ever existed" story against the fact that `2ATM71605` is a normal-looking retail FCC filing — probably fine (dev units likely predate a later full release+filing) but not explicitly checked.
6. Writeup §2 needs a decision: does the user have a specific patent/FCC anecdote to add, and should §2's framing be updated to reflect how much more thorough the actual FCC research became later in the session?
7. Writeup §3–13 not yet drafted.
8. BLE onboarding theory — still just an untested idea in the outline, no work done.
9. The user's personal `ai_auto_analysis` script — never run against the firmware collection (separate from, though related to, the Hub 4 JS task).
10. This `HANDOFF.md` file itself is currently untracked in git — confirm whether/when it should be committed.
