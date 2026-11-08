#!/usr/bin/env bash
# What the service runs. It gives the browser a virtual screen (the server has none), lets you SEE that screen through
# an SSH tunnel when you need to log in, and starts the automation. By default the automation starts PAUSED: you press
# Continue on the control page (through the tunnel) once the login looks right. Set CATALOGUEA_AUTOSTART=yes to skip that.
cd "$(dirname "$0")/../.." || exit 1
export DISPLAY=:99
export AUTOMATION_BROWSER_CHANNEL=chromium
export AUTOMATION_ALLOW_REAL_MONEY=yes

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >/dev/null 2>&1 &
sleep 1
# the virtual screen can be viewed ONLY from this server itself (localhost): you reach it through an SSH tunnel
x11vnc -display :99 -localhost -nopw -forever -quiet -bg -o /tmp/x11vnc.log >/dev/null 2>&1

ARGS="--auto-confirm --forever --resume-open"
if [ "${CATALOGUEA_AUTOSTART:-no}" != "yes" ]; then ARGS="$ARGS --start-paused"; fi
exec node laliga-run.js $ARGS
