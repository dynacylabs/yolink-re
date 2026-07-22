# Ghidra Tooling

Requires Ghidra >= 11.3.1. Install Ghidra itself separately (https://github.com/NationalSecurityAgency/ghidra/releases) - it is not vendored in this repo.

- `processors/ghidra-xtensa` - Xtensa processor module (needed for ESP32 disassembly)
- `extensions/ghidra-esp32-flash-loader` - loader for raw ESP32 flash dumps
- `scripts/ghidra-svd-loader` - loads an SVD file for peripheral memory mapping (run before analysis)
- `scripts/ghidra-gdt` - Ghidra Data Type archives generated from esp-idf headers, see [tools/esp-idf/esp-idf_gdt](../esp-idf/esp-idf_gdt)
- `scripts/ghidra-rizzo` - Rizzo signatures generated from esp-idf builds, see [tools/esp-idf/esp-idf_rizzo](../esp-idf/esp-idf_rizzo)
- `scripts/local/` - one-off scripts written for this project specifically (not their own repo)

See [docs/ghidra_projects.md](../../docs/ghidra_projects.md) for the step-by-step process used to load each firmware type.

## A note on nested submodules
`esp-idf_gdt` and `esp-idf_rizzo` each embed `ghidra-gdt`/`ghidra-rizzo` as their own submodule (used to build/regenerate those artifacts), and `ghidra-esp32-flash-loader` embeds a copy of `ghidra-svd-loader` plus `espressif/svd`. Since this repo already vendors `ghidra-gdt`, `ghidra-rizzo`, and `ghidra-svd-loader` directly under `scripts/`, **do not** `git submodule update --init --recursive` - see the top-level README for the correct (non-recursive) init command. Recursing would check out duplicate copies of the same three script repos.
