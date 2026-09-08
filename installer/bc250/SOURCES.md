# BC250 hardware support

GPU governor: filippor/cyan-skillfish-governor v0.4.12, MIT.
https://github.com/filippor/cyan-skillfish-governor/tree/v0.4.12
Release archive SHA256: 43cf992d4a2078bb4d208c6bf411293c8ba127f5170f4e59cb09e8cc25ec0821
The profile uses upstream voltage points only through1500MHz, disables D-Bus
and metrics patching, and retains thermal throttling. Individual board stability
must be tested. No BIOS/CU unlock/overclock or security-mitigation changes.

DP audio: elektricM/amd-bc250-docs at0524002c3be78e9926a3fc6fb9b40415b7b43b1f,
docs/troubleshooting/audio.md and issue39 (Fleischfrau; Elgar Weijtmans).
https://github.com/elektricM/amd-bc250-docs/issues/39
Code is MIT; documentation is CC BY-SA4.0. The adapted service changes only
DTO1 module7286310 to6000000 with phase240000 and hardware counter6000,
on PCI1002:13fe with amdgpu. It does not apply an unverified kernel patch.

Recovery: add naia.bc250.safe to the kernel command line to skip both services.
The basic-graphics nomodeset boot entry also skips them. Live and installed
systems carry the same binaries and service units. No network at first boot.
