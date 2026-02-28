#!/bin/sh
# Set fcitx5 as default input method for Korean input support
#
# On Wayland (KDE Plasma), GTK_IM_MODULE and QT_IM_MODULE must NOT be set.
# Setting them forces the legacy X11 IM path and breaks Wayland-native input
# (fcitx5 Wayland frontend), causing Korean character composition (moasseugi)
# to fail in terminals and other apps.
#
# See: https://fcitx-im.org/wiki/Using_Fcitx_5_on_Wayland#KDE_Plasma

export INPUT_METHOD=fcitx
export XMODIFIERS=@im=fcitx

# SDL/GLFW apps still need explicit IM module hints
export SDL_IM_MODULE=fcitx
export GLFW_IM_MODULE=fcitx

# Only set GTK/QT IM module on X11 sessions (not Wayland)
if [ "$XDG_SESSION_TYPE" = "x11" ]; then
    export GTK_IM_MODULE=fcitx
    export QT_IM_MODULE=fcitx
fi
