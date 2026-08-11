# Analyzing this repo's firmware with gaia

This repo (`yolink-re`) has firmware dumps under `hubs/*/firmware` and
`sensors/*/firmware`. This doc tells gaia (the MCP-driven Ghidra session —
see [`tools/gaia/README.md`](tools/gaia/README.md) for setup/tool basics)
exactly what's loadable today, with what parameters, and what to skip.

## What's in scope right now

Only the **sensor firmware** is loadable through gaia as-is. All of it is a
single MCU family:

- **YL09** SIP module (STM32L073xZ + SX1276), used in P0706, YS7704, YS7804 —
  see [`chips/YL09`](chips/YL09)
- **Discrete STM32L073RBT6** in YS8003 — same core/peripherals as the YL09's
  STM32 die, smaller flash

Both are ARM Cortex-M0+, Thumb-only, so they share one Ghidra language and one
real CMSIS-SVD file already in this repo:
[`chips/YL09/stm32L073xZ/STM32L0x3.svd`](chips/YL09/stm32L073xZ/STM32L0x3.svd).

The **ESP32 hub firmware** (P1603) is closer to in-scope than it used to be —
gaia's Ghidra now has native Xtensa support (see "Out of scope" below), but a
real preprocessing gap remains before `load_binary` can take it the same way
it takes the sensor `.bin`s. The **RK356x hub firmware** (P1606) is still out
of scope for a different reason. See "Out of scope" below for both.

## Why the firmware is one flat `.bin` per sensor

Each sensor was originally dumped as separate per-region files named by their
real chip address (`0x08000000.bin` = flash, `0x08080000.bin` = data EEPROM,
`0x20000000.bin` = SRAM) plus a duplicate `0x00000000.bin` (boot alias of
flash — Cortex-M mirrors flash at address 0 depending on boot-pin config;
verified byte-identical to `0x08000000.bin` in every case that has it).

`load_binary` only takes one `path` and one `base_address` — it doesn't have
a way to load several files into one program at different offsets the way
the manual GUI flow in [`docs/ghidra_projects.md`](docs/ghidra_projects.md)
does ("Add to Program" repeated per region). So each `factory_state/` directory
now also has a single combined **`factory_state.bin`**: the flash and EEPROM
regions laid out at their real offset from a `0x08000000` base, with the gap
between them filled with `0xFF` (erased-flash value). This is the file to
pass to `load_binary` — not the individual `0xADDR.bin` files.

SRAM (`0x20000000.bin`) is deliberately **not** included — it's volatile
runtime state captured at dump time, not persistent firmware, and mixing it
into a flat "firmware" image would misrepresent it as code/data that survives
power-off. See "SRAM block" below for how to still give Ghidra an SRAM region
to reference against.

The combine script (source of truth for the byte layout, re-run it if a new
sensor dump shows up) is
[`tools/scripts/firmware/combine_sensor_dumps.py`](tools/scripts/firmware/combine_sensor_dumps.py).

## Firmware inventory

| Binary | Chip | Flash | EEPROM | Load |
|---|---|---|---|---|
| [`sensors/P0706/V1.0/firmware/factory_state/factory_state.bin`](sensors/P0706/V1.0/firmware/factory_state/factory_state.bin) | YL09 (STM32L073xZ) | 196,608 B @ `0x08000000` | none captured | flash-only |
| [`sensors/YS7704/Vx.x/firmware/factory_state/factory_state.bin`](sensors/YS7704/Vx.x/firmware/factory_state/factory_state.bin) | YL09 (STM32L073xZ) | 196,608 B @ `0x08000000` | none captured | flash-only |
| [`sensors/YS7804/V0464/firmware/factory_state/factory_state.bin`](sensors/YS7804/V0464/firmware/factory_state/factory_state.bin) | YL09 (STM32L073xZ) | 196,608 B @ `0x08000000` | 8,192 B @ `0x08080000` | flash + EEPROM, gap-padded |
| [`sensors/YS8003/V0309/firmware/factory_state/factory_state.bin`](sensors/YS8003/V0309/firmware/factory_state/factory_state.bin) | discrete STM32L073RBT6 | 131,072 B @ `0x08000000` | none captured | flash-only |
| [`sensors/YS8003/Vx.x/firmware/factory_state/factory_state.bin`](sensors/YS8003/Vx.x/firmware/factory_state/factory_state.bin) | STM32L0 (see note) | 196,608 B @ `0x08000000` | none captured | flash-only |

Note on `YS8003/Vx.x`: [`sensors/YS8003/README.md`](sensors/YS8003/README.md)
identifies the chip as a discrete STM32L073RBT6 (128 KB flash — matches the
`V0309` dump exactly), but this earlier `Vx.x` dump captured 192 KB, matching
the YL09 SIP's larger STM32L073xZ instead. Don't silently normalize this —
if it comes up during analysis, flag it rather than assume one of the two
capture sizes is wrong.

`sensors/YS7704/V0418` is **excluded** — see "Excluded: known-invalid dumps".

## Analysis workflow

1. Copy or mount the target `factory_state.bin` somewhere reachable inside
   the gaia container (under `/home/ghidra/binaries` per the `docker run -v`
   mount in `tools/gaia/README.md`).

2. Confirm the exact language ID rather than assuming the string below is
   still current:
   ```
   list_languages(query="Cortex")
   ```
   Expected match: `ARM:LE:32:Cortex:default` (this is also what
   [`docs/ghidra_projects.md`](docs/ghidra_projects.md) uses for the
   same chip in the manual GUI flow).

3. Load at the real flash base — **do not** omit `base_address`, this is a
   raw headerless dump and every absolute address downstream depends on it:
   ```
   load_binary(path=".../factory_state.bin", language="ARM:LE:32:Cortex:default", base_address="0x08000000")
   ```

4. Load the real peripheral map from the vendor SVD instead of relying on
   `find_unmapped_references`'s heuristic clustering:
   ```
   load_svd(path=".../chips/YL09/stm32L073xZ/STM32L0x3.svd")
   ```
   (Copy/mount the SVD alongside the binary the same way — `load_svd` reads
   a local path inside the container, same as `load_binary`.)

5. **SRAM block**: the combined `.bin` doesn't include SRAM content, but code
   still references stack/global addresses in `0x20000000`-`0x20005000` (20 KB,
   confirmed via the vector table's initial SP — see below). Define it as an
   empty RW region so those references resolve instead of showing as
   unmapped:
   ```
   create_memory_block(name="SRAM", start="0x20000000", end="0x20005000", permissions="RW", initialized=False)
   ```

6. For the two-region images (`YS7804/V0464` today), the `0xFF`-padded gap
   between end-of-flash (`0x08030000`) and start-of-EEPROM (`0x08080000`) is
   *not* real flash — it's filler introduced purely to give the EEPROM bytes
   the right absolute offset. It's very unlikely to auto-analyze into
   spurious functions (`0xFF 0xFF` doesn't decode to a plausible Thumb
   prologue), but if `list_functions` turns up anything in that range, it's
   an artifact of the padding, not real code — remove it with
   `remove_function` rather than analyzing it.

7. Work the function list bottom-up as usual:
   ```
   list_functions(unanalyzed_only=True)   # ordered fewest-references/smallest first
   get_function_context(function=...)
   # rename_function / retype_variable / set_comment / etc.
   mark_function_analyzed(function=...)
   ```

8. Export back into the same `factory_state/` directory, matching the
   existing naming convention already used there (`factory_state.gzf`) so
   the result sits next to the `.bin` it came from:
   ```
   export_program(output_path=".../factory_state/factory_state.gzf")
   ```
   If a hand-driven GUI project already exists at that path from before
   gaia analyzed it (per the older workflow in `docs/ghidra_projects.md`),
   confirm with whoever owns the repo before overwriting it — it may contain
   manually-verified work gaia hasn't reproduced yet.

## Excluded: known-invalid dumps

**`sensors/YS7704/V0418`** has no combined `factory_state.bin` — its
`0x08000000.bin` source (128 bytes) isn't a flash dump at all. It decodes as
ASCII: `"k \r\n...ATE reed open ok \r\n"` — a captured UART/AT-command debug
log, not a vector table or code. Whatever produced this specific capture
didn't actually read the chip's flash. Don't attempt to load or analyze it;
the raw source files are left in place as-is (unmodified capture evidence),
just not combined or treated as firmware. See
[`sensors/YS7704/README.md`](sensors/YS7704/README.md) for the note on
why this version is excluded.

## Out of scope

- **P1603 (ESP32 hub)**: **Xtensa is no longer the blocker.** Stock Ghidra
  has shipped native Xtensa processor support for several releases now, and
  gaia's Ghidra install
  ([`tools/gaia/docker/Dockerfile`](tools/gaia/docker/Dockerfile)) is already
  on `12.1.2` — `list_languages(query="Xtensa")` should find a real entry;
  confirm the exact language ID the same way the sensor workflow above does
  before assuming a string. Don't assume the vendored submodules
  (`tools/ghidra/processors/ghidra-xtensa`,
  `tools/ghidra/extensions/ghidra-esp32-flash-loader`) are still needed for
  the processor itself — they may now only matter for the ESP32-image-aware
  loading behavior below.

  What's still genuinely unsolved: gaia's `load_binary` only takes one file
  at one `base_address`, the same limitation already documented above for
  the sensors — but the ESP32 app image isn't a flat memory image the way
  the combined sensor `.bin`s are. It's a segmented image format with its
  own header, and the segments load at scattered, non-contiguous vaddrs
  (confirmed against this repo's own dump —
  [`hubs/P1603/V1.0/firmware/factory_state/show_partitions.txt`](hubs/P1603/V1.0/firmware/factory_state/show_partitions.txt)
  shows the real partition table, `ota_0` at flash offset `0x10000` is the
  live app image; `docs/ghidra_projects.md`'s "ESP32 based hub" §Method 3 has
  the actual segment table: paddr `0x10020`→vaddr `0x3f400020`, paddr
  `0x35d5c`→vaddr `0x40080000`, etc. - five non-contiguous segments, not one
  linear region). Loading `ota_0.bin` flat at a single base address the way
  `combine_sensor_dumps.py` does for the sensors would put every symbol at
  the wrong address. Fixing this for gaia needs one of:
  - a preprocessing script (an ESP32 analog to
    [`tools/scripts/firmware/combine_sensor_dumps.py`](tools/scripts/firmware/combine_sensor_dumps.py))
    that reads the image header and either lays out a single padded flat
    file at the segments' real vaddrs, or
  - a per-segment loop of `create_memory_block` + a way to load raw bytes
    into each block at its own vaddr (gaia doesn't currently expose a
    "write bytes into an existing block from a file offset" tool - only
    `load_binary`, which is one file/one base address, and
    `create_memory_block`, which makes an empty region).

  Neither exists yet - this is a real, undone extension (like the Xtensa
  Dockerfile line used to be), not something to route around per-session.
  Until it's built, the *manual* GUI workflow in the "ESP32 based hub"
  section of [`docs/ghidra_projects.md`](docs/ghidra_projects.md) (which
  already handles the segmented-image problem via the vendored
  `ghidra-esp32-flash-loader`/`esp32_image_parser` plugins) is still the
  practical path for this chip. `reference_data/esp32.svd` and
  `reference_data/esp32_rom.elf` are already staged in this repo for
  whenever a binary is loaded that way.
- **P1606 (RK356x hub)**: no raw chip dump has been captured yet (see
  [`hubs/P1606/V1.0/README.md`](hubs/P1606/V1.0/README.md) — the full
  chip read is a 32 GB `rkdeveloptool rl` capture that hasn't been done). The
  application logic that *has* been extracted is a webpack-bundled Node.js
  app, already reverse engineered by hand into readable JS under
  [`hubs/P1606/V1.0/firmware/YS1606-UC_v0604/js_analysis/`](hubs/P1606/V1.0/firmware/YS1606-UC_v0604/js_analysis/) —
  not a Ghidra target.
