# Cataloguea results recorder on Oracle

The Oracle service runs `observer-run.js`, which reads completed results from the four virtual leagues and writes local records. It does not sign in, place bets, or submit forms. Chromium runs visibly on Xvfb and can be viewed through an SSH tunnel.

After the infrastructure bootstrap and read-only GitHub deploy-key setup:

1. Configure the shared backend: `cd ~/Cataloguea && npm run laliga:sync-setup`.
2. Check one read-only league visit: `xvfb-run -a env AUTOMATION_MODE=betking-live AUTOMATION_BROWSER_CHANNEL=chromium OBSERVER_NO_SANDBOX=yes node deploy/oracle/check-betking.js`.
3. Start the service: `sudo systemctl start cataloguea`.
4. Follow activity: `journalctl -u cataloguea -f`.
5. Check recording health: `sudo systemctl status cataloguea-watchdog.timer` and `journalctl -u cataloguea-watchdog`.

The watchdog checks each league's `lastVisitAt` every ten minutes. If a league stops recording, it restarts the service and posts a notice to the backend. The backend must have the authenticated `/betking/notice` route deployed for Telegram/email alerts. An optional Healthchecks.io URL can be set in `/etc/cataloguea.env` to monitor whole-server disappearance.

Never expose VNC (5900) or other control ports publicly. Use the infrastructure repository's SSH tunnel script.
