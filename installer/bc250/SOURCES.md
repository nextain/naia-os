# BC250 support candidate support2

DP audio adapts MIT code from elektricM/amd-bc250-docs commit
0524002c3be78e9926a3fc6fb9b40415b7b43b1f, docs/troubleshooting/audio.md.
https://github.com/elektricM/amd-bc250-docs/issues/39
Credit: Fleischfrau and Elgar Weijtmans. Full MIT license is included.
Only the measured DTO1 module7286310 / phase240000 / clock6000 signature
on PCI1002:13fe with amdgpu permits a write of module6000000.
The same guarded service is included in live and installed systems.
nomodeset or naia.bc250.safe skips it. No network needed at first boot.

The reviewed GPU governor is deliberately absent: per-board voltage stability,
concurrent governors and upstream error cleanup were not validated. No automatic
voltage/frequency/BIOS/kernel changes are made by this support package.
General graphics boot failure remains unresolved; the recovered host currently
boots with amdgpu and without nomodeset, which does not explain the earlier failure.
This candidate must undergo actual hardware boot and installation testing.
