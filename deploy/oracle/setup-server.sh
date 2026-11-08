#!/usr/bin/env bash
# Run ONCE on the Oracle server (Ubuntu), from the project folder:   bash deploy/oracle/setup-server.sh
# It installs Node.js, a virtual screen, the browser the project uses, and the service that runs the automation.
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT_DIR="$PWD"

echo "1/5  System packages (virtual screen, screen sharing for logging in, fonts)..."
sudo apt-get update
sudo apt-get install -y curl git unzip xvfb x11vnc fonts-liberation

echo "2/5  Node.js..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "3/5  Project packages..."
npm install

echo "4/5  The browser (Playwright's own Chromium: it supports the server's ARM chip; Google Chrome does not)..."
npx playwright install --with-deps chromium

echo "5/5  The service that starts the automation when the server boots..."
sed "s#__DIR__#${PROJECT_DIR}#g; s#__USER__#${USER}#g" deploy/oracle/cataloguea.service.template | sudo tee /etc/systemd/system/cataloguea.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable cataloguea

echo
echo "Done. Next (see deploy/oracle/README-ORACLE.md):"
echo "  - try a READ-ONLY check first:   xvfb-run -a env AUTOMATION_BROWSER_CHANNEL=chromium node laliga-scan.js"
echo "  - then log in to BetKing once through the tunnel, and start the service:   sudo systemctl start cataloguea"
