#!/usr/bin/env bash
# Run ONCE on the Oracle server (Ubuntu), from the project folder:   bash deploy/oracle/setup-server.sh
# The Oracle project's setup-cataloguea.sh runs this after cloning the application repository.
# It installs Node.js, Chromium, and the recording watchdog.
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT_DIR="$PWD"
RUN_USER="$(id -un)"

echo "1/5  System packages (virtual screen, local-only screen sharing, fonts)..."
sudo apt-get update
sudo apt-get install -y curl git unzip xvfb x11vnc fonts-liberation

echo "2/5  Node.js..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]; then
  echo "ERROR: Node.js 24 is required; found $(node --version)." >&2
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]; then
  echo "ERROR: Node.js 24 is required; found $(node --version)." >&2
  exit 1
fi

echo "3/5  Project packages..."
if [ -f package-lock.json ]; then npm ci; else npm install; fi

echo "4/5  Playwright's bundled Chromium (supports ARM64 and x86_64)..."
npx playwright install --with-deps chromium

echo "5/5  The recording watchdog and machine-specific settings..."
if [ ! -f /etc/cataloguea.env ]; then
  sudo tee /etc/cataloguea.env >/dev/null <<'ENV'
# Optional external heartbeat check; keep empty to disable.
HEALTHCHECK_URL=
ENV
fi
TOTAL_MB="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
if [ "$TOTAL_MB" -lt 2500 ]; then
  echo "This machine has ${TOTAL_MB} MB of memory: enabling low-memory settings."
  if ! sudo swapon --show --noheadings --raw --output=NAME | grep -Fxq /swapfile; then
    if [ ! -f /swapfile ]; then
      sudo fallocate -l 2G /swapfile
    fi
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
  fi
  grep -q '^OBSERVER_HEADLESS=' /etc/cataloguea.env || echo 'OBSERVER_HEADLESS=yes' | sudo tee -a /etc/cataloguea.env >/dev/null
  grep -q '^NODE_OPTIONS=' /etc/cataloguea.env || echo 'NODE_OPTIONS=--max-old-space-size=160' | sudo tee -a /etc/cataloguea.env >/dev/null
fi
sudo chown root:"$RUN_USER" /etc/cataloguea.env
sudo chown root:"$RUN_USER" /etc/cataloguea.env
sudo chmod 640 /etc/cataloguea.env
chmod +x deploy/oracle/watchdog.sh
for unit in cataloguea-watchdog.service cataloguea-watchdog.timer; do
  sed "s#__DIR__#${PROJECT_DIR}#g" "deploy/oracle/${unit}.template" | sudo tee "/etc/systemd/system/${unit}" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now cataloguea-watchdog.timer

echo
echo "Done. Next (see deploy/oracle/README-ORACLE-RECORDER.md):"
echo "  - check the read-only results page:   xvfb-run -a env AUTOMATION_MODE=betking-live AUTOMATION_BROWSER_CHANNEL=chromium OBSERVER_NO_SANDBOX=yes node deploy/oracle/check-betking.js"
echo "  - configure the backend:   npm run laliga:sync-setup"
echo "  - start the results recorder:   sudo systemctl start cataloguea"
