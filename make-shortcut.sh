#!/usr/bin/env bash
# Optional: puts a "La Liga Automation" icon on your Desktop. Double-click it to open a terminal that starts the run.
# (On Ubuntu, right-click the icon once and choose "Allow Launching".)
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/Desktop/LaLiga-Automation.desktop"
mkdir -p "$HOME/Desktop"
cat > "$TARGET" <<DESKTOP
[Desktop Entry]
Type=Application
Name=La Liga Automation
Comment=Start the BetKing La Liga automation
Exec=gnome-terminal -- bash -lc 'cd "$DIR" && bash start-laliga.sh play; echo; read -r -p "Press Enter to close"'
Terminal=false
Icon=utilities-terminal
DESKTOP
chmod +x "$TARGET"
echo "Created $TARGET"
echo "Right-click it once and choose 'Allow Launching', then double-click to start."
