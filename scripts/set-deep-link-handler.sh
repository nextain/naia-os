#!/bin/bash
# Switch naia:// deep link handler between Flatpak and dev build
# Usage: ./scripts/set-deep-link-handler.sh [dev|flatpak]

DESKTOP_FILE="$HOME/.local/share/applications/naia-shell-handler.desktop"

case "${1:-}" in
  dev)
    cat > "$DESKTOP_FILE" << 'EOF'
[Desktop Entry]
Type=Application
Name=Naia Deep Link Handler
Exec="/var/home/luke/dev/naia-os/shell/src-tauri/target/debug/naia-shell" %u
MimeType=x-scheme-handler/naia;
NoDisplay=true
EOF
    echo "Deep link → dev build"
    ;;
  flatpak)
    cat > "$DESKTOP_FILE" << 'EOF'
[Desktop Entry]
Type=Application
Name=Naia Deep Link Handler
Exec=flatpak run io.nextain.naia %u
MimeType=x-scheme-handler/naia;
NoDisplay=true
EOF
    echo "Deep link → Flatpak"
    ;;
  *)
    echo "Usage: $0 [dev|flatpak]"
    echo "Current: $(grep Exec= "$DESKTOP_FILE" 2>/dev/null | head -1)"
    exit 1
    ;;
esac

update-desktop-database "$HOME/.local/share/applications/" 2>/dev/null
xdg-mime default naia-shell-handler.desktop x-scheme-handler/naia
