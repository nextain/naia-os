#!/bin/sh
# On Wayland, GTK_IM_MODULE must NOT be set so that GTK4 apps use
# the Wayland text-input protocol for fcitx5 input method support.
# Bazzite's kde-ptyxis wrapper and/or xinputrc may set GTK_IM_MODULE=ibus
# which breaks Korean character composition (moasseugi) in terminals.
#
# This script runs during KDE Plasma startup (before startplasma-wayland
# propagates its environment to systemd user env via KUpdateLaunchEnvironmentJob).
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    unset GTK_IM_MODULE
    unset QT_IM_MODULE
fi
