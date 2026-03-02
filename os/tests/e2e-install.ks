# Naia OS E2E Installation Kickstart
# Unattended install for QEMU VM testing
# Usage: injected into ISO via e2e-install.sh

# Locale & keyboard
lang en_US.UTF-8
keyboard us
timezone UTC --utc

# Root & user (both required for complete spokes)
rootpw --lock
user --name=testuser --password=naia-e2e-test --plaintext --groups=wheel --gecos="E2E Test User"

# Network
network --bootproto=dhcp --device=link --activate --hostname=naia-e2e

# Disk
ignoredisk --only-use=vda
zerombr
clearpart --all --initlabel --drives=vda
reqpart --add-boot
autopart --type=btrfs

# Bootloader
bootloader --timeout=1

# Misc
firstboot --disable
selinux --permissive
reboot

%post --erroronfail --log=/var/log/naia-e2e-post.log
systemctl enable sshd.service
mkdir -p /home/testuser/.ssh
chmod 700 /home/testuser/.ssh
chown testuser:testuser /home/testuser/.ssh

# Install kernel + initramfs into /boot/ (ostree live image rsync doesn't populate /boot)
# Anaconda's CreateBLSEntriesTask returns empty because get_kernel_version_list() finds no kernels
KVER=$(ls /usr/lib/modules/ | sort -V | tail -1)
if [ -n "$KVER" ] && [ -f "/usr/lib/modules/${KVER}/vmlinuz" ]; then
    echo "[naia] Installing kernel ${KVER} into /boot via kernel-install..."
    kernel-install add "$KVER" "/usr/lib/modules/${KVER}/vmlinuz" 2>&1 || {
        echo "[naia] kernel-install failed, falling back to manual copy..."
        cp "/usr/lib/modules/${KVER}/vmlinuz" "/boot/vmlinuz-${KVER}"
        dracut --force "/boot/initramfs-${KVER}.img" "$KVER" 2>&1
        # Create BLS entry manually
        mkdir -p /boot/loader/entries
        MACHINE_ID=$(cat /etc/machine-id)
        BOOT_UUID=$(grub2-probe --target=fs_uuid /boot 2>/dev/null || blkid -s UUID -o value "$(findmnt -n -o SOURCE /boot)")
        cat > "/boot/loader/entries/${MACHINE_ID}-${KVER}.conf" <<BLSEOF
title Naia OS (${KVER})
version ${KVER}
linux /vmlinuz-${KVER}
initrd /initramfs-${KVER}.img
options root=UUID=$(findmnt -n -o UUID /) rootflags=subvol=root ro
BLSEOF
    }
    # Regenerate grub config with new kernel entries
    grub2-mkconfig -o /boot/grub2/grub.cfg 2>&1 || true
    echo "[naia] Kernel installation complete"
    ls -la /boot/vmlinuz-* /boot/initramfs-* 2>/dev/null || true
    ls -la /boot/loader/entries/ 2>/dev/null || true
else
    echo "[naia] WARNING: No kernel found in /usr/lib/modules/"
    ls /usr/lib/modules/ 2>/dev/null || echo "  (empty)"
fi

echo "NAIA_E2E_INSTALL_COMPLETE=$(date -Iseconds)" > /var/log/naia-e2e-marker
%end
