# NOTE: All projects require ghidra >= 11.3.1

## IMPORTANT NOTE!!!
When adding a new firmware:
- Create a new ghidra project
- Load the firmware using the steps below
- Export the program to the correct directory
- Commit this new project to the git repository

This will ensure we have a "master" project to work from. When performing analysis, do not overwrite this "master" project.

## Applicable to all projects
- Where available, use an SVD file and the SVD Loader for memory mapping, it makes things a lot easier
  - Make sure to run the SVD Loader before running the Analysis and this will make the analysis much more useful
  - The SVD Loader can be found here (https://github.com/dynacylabs/ghidra-svd-loader). Note, this is downloaded by `tools/ghidra/download_tools.sh`

## ESP32 based hub
### Method 1 
Install the esp32 flash loader plugin here (https://github.com/dynacylabs/ghidra-esp32-flash-loader). Note, this is downloaded by `tools/ghidra/download_tools.sh`. Instructions to build the plugin can be found in the `README.md`.

Then follow this guide: https://olof-astrand.medium.com/analyzing-an-esp32-flash-dump-with-ghidra-e70e7f89a57f

A PDF of this guide can be found in `docs/references/Analyzing an esp32 flash dump with ghidra by Olof Astrand Medium.pdf`

### Method 2
There is the possibility that the esp32 flash loader from method 1 does not correctly identify a flash dump as an esp32 image. In this case, the `esp32 image parser` will be needed. This can be obtained here (https://github.com/dynacylabs/esp32_image_parser). Note, this is downloaded by `tools/ghidra/download_tools.sh`. The following information will aid in getting the image loaded into ghidra.

Then follow this guide: https://olof-astrand.medium.com/reverse-engineering-of-esp32-flash-dumps-with-ghidra-or-ida-pro-8c7c58871e68

A PDF of this guide can be found in `docs/references/Reverse engineering of esp32 flash dumps with ghidra or IDA Pro by Olof Astrand Medium.pdf`

### Method 3 (Last Resort)
There is the possibility that the esp32 flash loader from method 1 does not correctly identify a flash dump as an esp32 image. In this case, the `esp32 image parser` will be needed. This can be obtained here (https://github.com/dynacylabs/esp32_image_parser). Note, this is downloaded by `tools/ghidra/download_tools.sh`. The following information will aid in getting the image loaded into ghidra.

```
Partition Table
## Label            Usage            Type ST Offset   Length
0  otadata          OTA data         01   00 00009000 00002000
1  phy_init         RF data          01   01 0000b000 00001000
2  ota_0            OTA app          00   10 00010000 00180000
3  ota_1            OTA app          00   11 00190000 00180000
4  nvs              WiFi data        01   02 00310000 00030000
5  storage0         unknown          fe   00 00340000 00059000
6  ktt              unknown          fe   00 00399000 00060000

segment 0: paddr=0x00010020 vaddr=0x3f400020 size=0x22b08 (142088) map
segment 1: paddr=0x00032b30 vaddr=0x3ffb0000 size=0x03224 ( 12836) load
segment 2: paddr=0x00035d5c vaddr=0x40080000 size=0x00400 (  1024) load
segment 3: paddr=0x00036164 vaddr=0x40080400 size=0x09eac ( 40620) load
segment 4: paddr=0x00040018 vaddr=0x400d0018 size=0x9afe0 (634848) map
segment 5: paddr=0x000db000 vaddr=0x4008a2ac size=0x084e8 ( 34024) load

heap_init: At 3FFAE6E0 len 00001920 (6 KiB): DRAM
heap_init: At 3FFBA3A8 len 00025C58 (151 KiB): DRAM
heap_init: At 3FFE0440 len 00003AE0 (14 KiB): D/IRAM
heap_init: At 3FFE4350 len 0001BCB0 (111 KiB): D/IRAM
heap_init: At 40092794 len 0000D86C (54 KiB): IRAM

cpu_start: Starting app cpu, entry point is 0x400811d4
```

## YL09 chip
1. `File`>`Import File`, select the firmware file
2. Set the language to `ARM:LE:32:Cortex:default`
3. Click `Options`
4. Set the `Block Name` to match the name of the firmware file
5. Set the `Base Address`, `File Offset`, `Length` appropriately
6. Close the `Options` window and click `OK` to add the file to the project
- IF adding multiple files, click `NO` when asked if you want to analyze the file
7. Click `OK` on the summary window that appears
8. IF there are multiple files to be added, `File`>`Add to Program`
9. Add the file similar to steps 8-12. Repeat until all files are added at the correct locations
10. `Analysis`>`Auto Analyze '<file_name>'`
11. Check the `ARM Aggressive Instruction Finder (Prototype)` box on the left side
12. Click `Analyze` and let ghidra analyze the project

## Saving
Use `File` > `Export Program` in the Code Browser to export a Ghidra Zip File into the appropriate directory.