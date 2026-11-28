#!/usr/bin/env bash
# On a 1 GB AMD Micro, setup-server.sh sets OBSERVER_HEADLESS=yes so no virtual
# screen is started. Larger instances use a private virtual screen accessible
# only through the infrastructure repository's SSH tunnel.
cd "$(dirname "$0")/../.." || exit 1

if [ "${OBSERVER_HEADLESS:-no}" != "yes" ]; then
  export DISPLAY=:99
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  Xvfb :99 -screen 0 1280x900x24 -nolisten tcp >/dev/null 2>&1 &
  sleep 1
  x11vnc -display :99 -localhost -nopw -forever -quiet -bg -o /tmp/x11vnc.log >/dev/null 2>&1
fi

exec node observer-run.js
