# YL09 Info

[Datasheet](https://www.yosmart.com/wp-content/uploads/userguide/YL09_SIP_Product-Specification.pdf) - block structure, pin information (also mirrored locally as [YL09_SIP_Product-Specification.pdf](YL09_SIP_Product-Specification.pdf))

Confirmed present (by chip marking, via FCC internal-photos filings) in every sensor documented in this repo except [YS8003](../../sensors/YS8003), which uses a discrete STM32L073RBT6 + SX1276 instead - see [fcc_filings/](../../fcc_filings) for the per-device chip identification writeups this was sourced from.

![YL09 chip, photographed for an FCC filing](images/yl09-chip-fcc-photo.png)

![image](https://github.com/user-attachments/assets/510a51b8-2b91-414c-a055-205d84e23803)

![image](https://github.com/user-attachments/assets/a3bc9656-92d9-484b-941c-a066c5826903)

![image](https://github.com/user-attachments/assets/59de540a-a694-4514-b48a-db3237a582e7)


## SPI Pins
|Port |Bit   |Signal|
|-----|------|------|
|GPIOB|0x8000|MOSI  |
|     |0x4000|MISO  |
|     |0x2000|SCK   |
|     |0x1000|NSS   |
|     |0x0800|DIO0  |

