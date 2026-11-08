# Running Cataloguea on an Oracle Cloud server

NOT YET TRIED ON A REAL SERVER. These files are written to the best of my knowledge and checked for syntax only.
Go step by step, and do the read-only checks before any real bet.

## 0. What you are doing
You rent a small always-on Linux computer (an Oracle "Compute Instance"). The automation runs on it all day, in its own
virtual screen. You look at it and control it from your laptop (or later your phone) through a safe SSH tunnel. Nothing
is opened to the internet except SSH.

## 1. Create the server (Oracle Cloud Console, in your browser)
1. Sign in, then menu, Compute, Instances, Create instance.
2. Name: `cataloguea`.
3. Image: Canonical Ubuntu 22.04 or 24.04 (it will say aarch64/ARM).
4. Shape: change shape, Ampere, `VM.Standard.A1.Flex`, 2 OCPU and 12 GB memory (look for the "Always Free-eligible" label).
   If you get "Out of host capacity", try again later or in another availability domain.
5. Networking: leave the default (new virtual cloud network, public subnet, assign a public IPv4 address).
6. SSH keys: on your laptop run `ssh-keygen -t ed25519` if you have no key, then paste the content of `~/.ssh/id_ed25519.pub`.
7. Boot volume: 50 GB is plenty. Create. Wait for "Running", then copy the Public IP.
Do not turn on anything marked paid. Keep an eye on the account's billing page the first week.

## 2. Connect and install
```
ssh ubuntu@<the public IP>
git clone <your GitHub repository> Cataloguea && cd Cataloguea
bash deploy/oracle/setup-server.sh
```
(or copy the project with `scp`). Put your sync address in with `npm run laliga:sync-setup` if you use the backend.

## 3. Read-only check (no bets)
```
xvfb-run -a env AUTOMATION_BROWSER_CHANNEL=chromium node laliga-scan.js
```
It opens BetKing in the virtual screen and prints all 20 teams' odds. Two things can go wrong here, and both are about BetKing,
not the code: it may refuse a login from a server abroad, or ask for extra verification. If so, stop here and tell me.

## 4. Log in once, and control it (the tunnel)
On YOUR laptop open a second terminal and keep it open:
```
ssh -L 5900:localhost:5900 -L 4545:localhost:4545 ubuntu@<the public IP>
```
Start the service on the server: `sudo systemctl start cataloguea`.
- Look at the server's browser: on the laptop use a VNC viewer (Remmina is on Ubuntu) and connect to `localhost:5900`.
  Log in to BetKing there. It remembers the login.
- Control page: open `http://localhost:4545` in the laptop's browser. The service starts PAUSED; press Continue to begin.

## 5. Every day
- `sudo systemctl status cataloguea` and `journalctl -u cataloguea -f` show what it is doing.
- Pause, Continue, Stop: the buttons on `http://localhost:4545` (with the tunnel open).
- Stop it properly: `sudo systemctl stop cataloguea` (it finishes the round in hand and settles it first, up to 7 minutes).
- It starts again by itself after a reboot, but PAUSED, so nothing is bet until you press Continue. To start playing without
  waiting for Continue, add `Environment=CATALOGUEA_AUTOSTART=yes` to the service file (only when you trust it).
- If a round was in progress when the server crashed or lost power, the next start first reads that round's result and settles it.
- It does NOT restart itself after a deliberate halt (for example "a bet may exist without confirmation"). Look at the log first.

## 6. Switching BetKing account
Pause (the state is sent to your backend), open the server's browser through VNC, log out and log in as the other account,
press Continue (the newest state is fetched first). Or keep two logins ready with `--account second`.

## Things to watch
- Oracle may reclaim an Always Free instance it thinks is idle. Switching the Oracle account to Pay-As-You-Go (you stay inside the
  free limits) is the usual protection. Check Oracle's current terms yourself.
- Never open the VNC or control-page ports to the internet. They are tied to localhost on purpose.
- The browser login is stored in `~/.cataloguea/` on the server. Treat that folder like a password.
