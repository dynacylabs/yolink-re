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
#### 1. Booting into `Maskrom` mode
- Power off hub
- Jump/Connect the `BOOT_SW` "resistor" pins
- Power on hub

#### 2. Booting bootloader
Get bootloader from https://docs.radxa.com/en/zero/zero3/low-level-dev/rkdeveloptool
```
user@re-pi:~/Desktop/yolink/investigations/hub4/initial$ rkdeveloptool db rk356x_spl_loader_ddr1056_v1.12.109_no_check_todly.bin 
Downloading bootloader succeeded.
```

#### 3. Checking for the device
```
user@re-pi:~/Desktop/yolink/tools/rkdeveloptool$ rkdeveloptool ld
DevNo=1 Vid=0x2207,Pid=0x350a,LocationID=103    Maskrom
```

#### 4. Look for partitions
```
user@re-pi:~/Desktop/yolink/investigations/hub4/initial$ rkdeveloptool ppt
**********Partition Info(GPT)**********
NO  LBA       Name                
00  0000F000  bootfs
01  0020F000
```

#### 5. Determine chip size
```
user@re-pi:~/Desktop/yolink/investigations/hub4/initial$ rkdeveloptool rfi
Flash Info:
        Manufacturer: SAMSUNG, value=00
        Flash Size: 29820 MB
        Flash Size: 61071360 Sectors
        Block Size: 512 KB
        Page Size: 2 KB
        ECC Bits: 0
        Access Time: 40
        Flash CS: Flash<0>
```

#### 4. Read entire chip
- Read using 
  - `rkdeveloptool rl 0 61071360 rkdeveloptool_rl_0_61071360.bin`
- Note this will be a 32G file

https://www.armbian.com/orangepi3b/

## Application logic (JavaScript)
The hub's own application logic ships as a webpack-bundled Node.js app (`firmware/YS1606-UC_v0604/usr/lib/p1606/p1606mq-dev.tar.gz`). See [`firmware/YS1606-UC_v0604/js_analysis/`](firmware/YS1606-UC_v0604/js_analysis/README.md) for a renamed/restructured, human-readable version of the core app logic and what it revealed - including hard confirmation that this hub runs a real embedded **ChirpStack** instance, the hub's cloud-registration flow, hardcoded local MQTT broker credentials, and evidence it's built to bridge older YoLink hubs (specifically P1605) into itself.
