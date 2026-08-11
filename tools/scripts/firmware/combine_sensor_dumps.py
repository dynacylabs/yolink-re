"""Combine per-region STM32 factory_state dumps (0xADDR.bin files) into a
single padded factory_state.bin per sensor/version, laid out at real chip
offsets (gaps filled with 0xFF). SRAM (0x20000000) is intentionally excluded
- it's volatile runtime state, not persistent firmware. The 0x00000000 file
is a boot-alias of flash (verified byte-identical) and is also excluded.
"""

import os

FILL = 0xFF

TARGETS = [
    "sensors/P0706/V1.0/firmware/factory_state",
    "sensors/YS7704/V0418/firmware/factory_state",
    "sensors/YS7704/Vx.x/firmware/factory_state",
    "sensors/YS7804/V0464/firmware/factory_state",
    "sensors/YS8003/V0309/firmware/factory_state",
    "sensors/YS8003/Vx.x/firmware/factory_state",
]

EXCLUDE = {0x00000000, 0x20000000}


def combine(dir_path):
    regions = []
    for name in sorted(os.listdir(dir_path)):
        if not name.endswith(".bin") or not name.startswith("0x"):
            continue
        addr = int(name[:-4], 16)
        if addr in EXCLUDE:
            continue
        with open(os.path.join(dir_path, name), "rb") as f:
            data = f.read()
        regions.append((addr, data, name))

    if not regions:
        print(f"  SKIP {dir_path}: no flash/eeprom regions found")
        return

    regions.sort(key=lambda r: r[0])
    base = regions[0][0]
    end = max(addr + len(data) for addr, data, _ in regions)
    size = end - base

    image = bytearray([FILL]) * size
    for addr, data, name in regions:
        off = addr - base
        image[off:off + len(data)] = data

    out_path = os.path.join(dir_path, "factory_state.bin")
    with open(out_path, "wb") as f:
        f.write(image)

    layout = ", ".join(f"0x{addr:08X}+{len(data)}" for addr, data, _ in regions)
    print(f"  OK {out_path} ({size} bytes, base 0x{base:08X}) <- {layout}")


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    for rel in TARGETS:
        print(rel)
        combine(os.path.join(repo_root, rel))
