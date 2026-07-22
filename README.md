# yolink-re

Personal reverse-engineering project focused on YoLink's consumer hub/sensor ecosystem (hardware teardown, firmware extraction, and Ghidra-based static analysis). This repo consolidates and supersedes the earlier `yolink` and `yolink_re` repos.

See [docs/writeup](docs/writeup/writeup.md) for the narrative writeup (a work in progress, eventually a blog post) and [docs/testing_methodology.md](docs/testing_methodology.md) for the test plan behind the hub/LoRa/MQTT behavior findings.

## Cloning

```
git clone git@github.com:dynacylabs/yolink-re.git
cd yolink-re
git submodule update --init
```

**Do not** use `--recurse-submodules` (on the `clone` or `submodule update` command). Several submodules embed their own copies of other submodules already vendored directly in this repo (see [tools/ghidra/README.md](tools/ghidra/README.md)); recursing would check out duplicate copies. The command above initializes only this repo's direct submodules, which is what you want.

A few submodules (`tools/esp-idf/esp-idf_elfs`, `tools/esp-idf/esp-idf_gdt`, `tools/esp-idf/esp-idf_rizzo`) are multi-gigabyte and are intentionally left uninitialized by the command above - see [tools/README.md](tools/README.md) if you need them.

## Structure

- [chips/](chips) - shared components used across multiple products (e.g. the YL09 SiP)
- [hubs/](hubs) - one directory per hub product/revision: board photos, firmware dumps, Ghidra projects, serial logs
- [sensors/](sensors) - one directory per sensor product/revision, same layout as hubs
- [docs/](docs) - writeup, testing methodology, Ghidra setup notes, reference articles
- [reference_data/](reference_data) - vendor SVDs/ELFs/boot binaries shared across devices
- [tools/](tools) - Ghidra plugins, esp-idf-based artifact generators, flashing tools, misc scripts

Each hardware directory has its own `README.md` describing what's there; `firmware/<name>/factory_state` is always the as-shipped dump, other names indicate OTA/intercepted updates.

## Background
- FCC filings for YoSmart devices: https://fccid.io/2ATM7
