# Mounting
```
sudo losetup -fP --show YS1606-UC_v0604.bin
sudo mkdir /mnt/loop7p1 /mnt/loop7p2
sudo mount -o ro /dev/loop7p1 /mnt/loop7p1
sudo mount -o ro /dev/loop7p2 /mnt/loop7p2
```

# Unmounting
```
sudo umount /mnt/boot
sudo umount /mnt/rootfs
sudo losetup -d /dev/loop0
```
