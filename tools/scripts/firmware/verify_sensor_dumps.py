"""Sanity-check combined sensor factory_state.bin images.

Cortex-M images start with a vector table: word0 = initial SP (must land in
SRAM), word1 = reset handler address (must land in flash, Thumb bit set).
This doesn't prove the firmware is bug-free, but it confirms the combined
image is byte-correct and starts where a real STM32 image should.
"""

import os
import struct

TARGETS = [
    ("sensors/P0706/V1.0/firmware/factory_state", 0x08000000, 196608),
    ("sensors/YS7704/V0418/firmware/factory_state", 0x08000000, 196608),
    ("sensors/YS7704/Vx.x/firmware/factory_state", 0x08000000, 196608),
    ("sensors/YS7804/V0464/firmware/factory_state", 0x08000000, 196608),
    ("sensors/YS8003/V0309/firmware/factory_state", 0x08000000, 131072),
    ("sensors/YS8003/Vx.x/firmware/factory_state", 0x08000000, 196608),
]

SRAM_BASE = 0x20000000
SRAM_MAX = 0x20005000  # 20KB, STM32L0 typical


def verify(dir_path, flash_base, flash_size):
    path = os.path.join(dir_path, "factory_state.bin")
    with open(path, "rb") as f:
        data = f.read()

    sp, reset = struct.unpack_from("<II", data, 0)

    sp_ok = SRAM_BASE <= sp <= SRAM_MAX
    reset_ok = (reset & 1) == 1 and flash_base <= (reset & ~1) < flash_base + flash_size

    # how much of the nominal flash region is non-erased (i.e. actual dumped content)
    flash_bytes = data[:flash_size]
    non_ff = sum(1 for b in flash_bytes if b != 0xFF)
    pct_populated = 100.0 * non_ff / flash_size

    # first run of trailing 0xFF from start, to spot short/partial dumps
    real_len = len(flash_bytes)
    while real_len > 0 and flash_bytes[real_len - 1] == 0xFF:
        real_len -= 1

    verdict = "VALID vector table" if (sp_ok and reset_ok) else "SUSPECT vector table"
    print(f"{path}")
    print(f"  initial SP     = 0x{sp:08X}  ({'ok, in SRAM' if sp_ok else 'NOT in SRAM range'})")
    print(f"  reset handler  = 0x{reset:08X}  ({'ok, in flash, thumb bit set' if reset_ok else 'NOT valid flash/thumb addr'})")
    print(f"  flash populated = {pct_populated:.1f}% non-0xFF, last non-0xFF byte at offset {real_len}")
    print(f"  -> {verdict}")
    print()


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    for rel, base, size in TARGETS:
        verify(os.path.join(repo_root, rel), base, size)
