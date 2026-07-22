# Tools

- [ghidra/](ghidra) - Ghidra processors/extensions/scripts for analyzing dumps (submodules)
- [esp-idf/](esp-idf) - esp-idf builds used to generate GDT/Rizzo artifacts, plus a collection of compiled esp-idf example ELFs (all submodules, see warning below)
- [esp32_image_parser](esp32_image_parser) - command-line ESP32 image/partition parser (submodule), used as a fallback when `ghidra-esp32-flash-loader` doesn't recognize a dump
- [rkdeveloptool](rkdeveloptool) - Rockchip flashing/read tool (submodule, upstream `rockchip-linux/rkdeveloptool`), needed for [P1606](../hubs/P1606)
- [scripts/](scripts) - standalone analysis scripts (partition dumping, NVS/gwConfig manipulation, etc.)

## Large submodules
`esp-idf/esp-idf_elfs`, `esp-idf/esp-idf_gdt`, and `esp-idf/esp-idf_rizzo` are multi-GB repositories (compiled esp-idf trees/artifacts). They are registered as submodules but **not** cloned by default - only run `git submodule update --init` on these specific paths if you actually need them.
