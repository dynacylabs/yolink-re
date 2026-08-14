# Hub 4

## Debug harness pinout
```
COLOR      	PIN LABEL       BITMAGIC PIN

TBD		        ATE_RX
TBD		        ATE_TX
TBD		        ATE_GND

TBD	    	    DEBUG_RX
TBD		        DEBUG_TX
TBD		        DEBUG_GND

BLACK      	  USB0_DM         1
WHITE      	  USB0_DP         2
GREY        	SYS_5V          3
PURPLE      	GND             GND
BLUE        	+3.3V           4
GREEN       	GND             GND
YELLOW      	BURN            5
ORANGE      	RESET           6
```

## Serial
### Determining baud rate
- `tools/scripts/serial/test_common_baud.py` run while board was connected to an FT2232H serial interface
- Board was NOT powered by DC Jack, instead 5V pin given 5V from FT2232H
- Appeared to be in some sort of loop, allowing script to listen and determine baud rate
- Baud rate sucessful was 1500000
- Device has a login prompt when booted normally

## Firmware
### Reading chip

**The verified-working method is Method B below.** Method A (Maskrom +
`rkdeveloptool rl`) looks like it works - it completes at 100% with no
USB/protocol errors, reads are byte-for-byte reproducible across separate
Maskrom sessions and across two different loader files/versions - but the
data it returns for the actual OS content is **silently wrong**. Confirmed
by dumping the same physical chip both ways and comparing: Method A read
the `bootfs` partition as a validly-structured but completely *empty* FAT32
volume, and the entire ~27.8GB root partition as one uniform repeating byte
(`0xCC`) end to end, while the module was demonstrably alive and running
the whole time (joined WiFi, showed up in the YoLink app). Method B, which
reads through the SoC's real, fully-initialized eMMC driver instead of the
Maskrom-mode SPL loader's, found a completely intact ext4 filesystem
(label `opi_root`) in that same region. The root cause was never fully
pinned down - a leading theory is `rcb`'s `"First 4m Access"` capability
flag, since every real byte Method A ever returned fell inside the first
4MB of the disk and everything past that point came back suspect, but a
boundary test right at that 4MB mark was inconclusive. Don't trust Method A
for anything beyond a quick "is a device present" check
(`ld`/`rfi`/`rid`/`rci`) - use Method B for an actual data read.

#### Method A: Maskrom + `rkdeveloptool` (device detection only - see warning above)

1. Booting into `Maskrom` mode: power off the hub/module, jump/connect the
   `BOOT_SW` "resistor" pins, power on.
2. Download a loader (get one from
   https://docs.radxa.com/en/zero/zero3/low-level-dev/rkdeveloptool -
   `rk356x_spl_loader_ddr1056_v1.12.109_no_check_todly.bin` and the
   alternate `v1.10.111` build both produce the identical result, so the
   specific loader version isn't the issue):
   ```
   rkdeveloptool db rk356x_spl_loader_ddr1056_v1.12.109_no_check_todly.bin
   Downloading bootloader succeeded.
   ```
3. Confirm the device is present:
   ```
   rkdeveloptool ld
   DevNo=1 Vid=0x2207,Pid=0x350a,LocationID=103    Maskrom
   ```
4. `rkdeveloptool ppt`/`rfi`/`rid`/`rci`/`rcb` for partition table, flash
   info, flash ID, chip info (self-reports as RK3568, byte-reversed ASCII
   in the `rci` output, not RK3566 - same silicon either way), and
   capability flags - all fine to trust, this is metadata/protocol-level
   info, not a bulk data read. `cs 9` (switch to SPI NOR) fails outright on
   this chip and `rid` reports the connected storage as literal ASCII
   `"EMMC "` - there's no separate SPI NOR to fall back on here, and no SD
   card slot on the CM4 module itself (the carrier board's TF slot is a
   separate, unrelated storage device, not part of this chip).
5. **Do not trust `rl` for a real dump of this module** - see the warning
   above. If you need real data, skip to Method B.

#### Method B: boot from SD card, `dd` over the network (verified working)

The Orange Pi CM4 needs a bootable SD card to write to eMMC at all per
Orange Pi's own documented workflow - and the same path works in reverse
to *read* eMMC through a real, live, fully-initialized OS instead of
Maskrom's minimal SPL loader.

1. Flash an SD card with Armbian's Orange Pi 3B image (RK3566/RK3568
   platform-compatible with the CM4 - Orange Pi doesn't ship a dedicated
   Armbian build for the CM4's compute-module form factor specifically).
   Vendor kernel, minimal/CLI variant is enough - no desktop needed:
   `https://dl.armbian.com/orangepi3b/Trixie_vendor_minimal`. Verified
   against `Armbian_community_26.11.0-trunk.1_Orangepi3b_trixie_vendor_6.1.115_minimal.img.xz`.
2. Insert the SD card into the CM4 Base carrier board's TF slot, connect
   Ethernet (this image's WiFi driver compatibility with this exact SoM
   isn't verified; Ethernet is the safe bet), and boot. SD takes boot
   priority over eMMC, so no MaskROM/`BOOT_SW` jumper needed for this -
   power on normally.
3. Log in over serial or SSH (`root`/`1234` default, forces an immediate
   password change + new user creation on first login) and confirm the
   kernel sees a real filesystem, not just raw LBA ranges:
   ```
   lsblk /dev/mmcblk0 -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT
   mmcblk0     29.1G
   ├─mmcblk0p1    1G vfat   opi_boot
   └─mmcblk0p2 27.8G ext4   opi_root
   ```
   The created user account lands in the `disk` group by default, so
   `/dev/mmcblk0` (and `p1`/`p2`/`boot0`/`boot1`/`rpmb`) are directly
   readable without `sudo` - only *mounting* needs root.
4. **If manually computing partition byte offsets from the raw GPT
   entries, don't** - trust the kernel instead
   (`/sys/class/block/mmcblk0p2/start`, in 512-byte sectors). Manual GPT
   parsing during this investigation was consistently off by exactly 4096
   sectors (2MiB) from what the kernel actually uses - the discrepancy was
   never root-caused, so don't assume raw partition-entry math is safe to
   trust here.
5. Dump the whole disk and stream it straight to another machine over the
   network rather than writing 29GB to the SD card itself (which likely
   doesn't have room, and would be a second full-disk read/write pass for
   no reason). This repo's copy was done straight from the live shell,
   piped over SSH to a receiving host on the same LAN segment (a direct
   point-to-point Ethernet link in this case, not through Maskrom/USB at
   all):
   ```
   dd if=/dev/mmcblk0 bs=4M | ssh user@<host> 'cat > emmc_dump.img'
   ```
   Verified end to end this way: 31,268,536,320 bytes (exact match to the
   reported flash size), real GPT + FAT32 `opi_boot` + ext4 `opi_root`
   (superblock magic `53 ef` confirmed at the correct, kernel-reported
   offset), i.e. a genuinely complete and correct image - unlike anything
   Method A ever produced.

The resulting dump is committed to this repo, `xz -9e`-compressed via
git-lfs: [`firmware/factory_state/factory_state.bin.xz`](firmware/factory_state/factory_state.bin.xz)
(529MB compressed, 29.1GB raw).

## Application logic (JavaScript)
The hub's own application logic ships as a webpack-bundled Node.js app (`firmware/YS1606-UC_v0604/usr/lib/p1606/p1606mq-dev.tar.gz`). See [`firmware/YS1606-UC_v0604/js_analysis/`](firmware/YS1606-UC_v0604/js_analysis/README.md) for a renamed/restructured, human-readable version of the core app logic and what it revealed - including hard confirmation that this hub runs a real embedded **ChirpStack** instance, the hub's cloud-registration flow, hardcoded local MQTT broker credentials, and evidence it's built to bridge older YoLink hubs (specifically P1605) into itself.
