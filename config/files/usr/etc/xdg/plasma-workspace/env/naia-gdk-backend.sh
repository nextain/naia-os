#!/bin/sh
# Select the GTK backend for the Plasma session before Naia Shell starts.
#
# naia-shell's own main() does this, in effect:
#
#     if GDK_BACKEND is unset and DISPLAY is set: GDK_BACKEND=x11
#
# On KDE Wayland, DISPLAY *is* set — XWayland provides it — so the binary
# forces itself onto X11, and there the main Tauri window maps at 1x1 and is
# invisible. The app runs, the agent connects, voice initializes, every
# automated check passes, and the user sees nothing.
#
# The Flatpak build avoided this with a launcher wrapper (flatpak/naia-launch.sh,
# added by #360). The RPM has no wrapper: its desktop entry calls the binary
# directly. So the selection moves here, into the session environment, which
# covers both the app-menu launch and the autostart entry without touching the
# RPM-owned .desktop file.
#
# The binary only forces x11 when GDK_BACKEND is *unset*, so setting it here is
# enough to disarm that path — this uses the binary's own escape hatch rather
# than patching it.
#
# The trade-off is the one #360 already accepted: on Wayland the main window
# renders and the browser panel's Chrome embedding (XReparentWindow) does not.
# On X11 both work. A visible window is the more important of the two.

if [ "${XDG_SESSION_TYPE}" = "wayland" ] || { [ -z "${XDG_SESSION_TYPE}" ] && [ -n "${WAYLAND_DISPLAY}" ]; }; then
    export GDK_BACKEND=wayland
else
    export GDK_BACKEND=x11
fi
