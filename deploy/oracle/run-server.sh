#!/usr/bin/env bash
# The Oracle service runs the read-only results observer in a virtual screen.
cd "$(dirname "$0")/../.." || exit 1
export DISPLAY=:99
export AUTOMATION_MODE=betking-live
export AUTOMATION_BROWSER_CHANNEL="${AUTOMATION_BROWSER_CHANNEL:-chromium}"
export AUTOMATION_BROWSER_HEADLESS=false
export OBSERVER_NO_SANDBOX=yes

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >/dev/null 2>&1 &
sleep 1
x11vnc -display :99 -localhost -nopw -forever -quiet -bg -o /tmp/x11vnc.log >/dev/null 2>&1

exec node observer-run.js
