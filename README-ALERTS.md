# Alerts v2: Telegram + email, wake call, started/resumed/ended notices

Built on top of the CURRENT repos (the win email and the network fixes are already in them).

## 1. Files (copy over the same path)
Backend (Campusbuy):
- Utils/betkingMail.js      (rewritten: win, low balance, started/resumed/ended, email + Telegram)
- Utils/betkingTelegram.js  (NEW)
- Controllers/catalogueaBKCtrl.js
- Routes/catalogueaBKRoute.js
Project (Cataloguea):
- laliga-run.js
- automation/sync/backendEvents.js
- automation/sync/balanceMonitor.js  (NEW)
- automation/sync/dailyJobs.js       (NEW)

## 2. Telegram (free), once
1. Install Telegram on the phone. Open @BotFather, send /newbot, choose a name; it gives a TOKEN.
2. Open your new bot, press Start, send it "hello".
3. In a browser open https://api.telegram.org/bot<TOKEN>/getUpdates and copy the number after "chat":{"id": ...  (that is the CHAT ID).
4. Render > the backend service > Environment, add (never put these in GitHub):
   TELEGRAM_BOT_TOKEN=<token>      TELEGRAM_CHAT_ID=<chat id>
   BETKING_ALERT_EMAIL=bootstrap199502@gmail.com   (this is now also the default)
   RESEND_API_KEY and LALIGA_SYNC_KEY must already be there. Save, redeploy.
5. Sound: Telegram > open the bot chat > its name at the top > Notifications > Customize > Sound.
   Android phone Settings > Apps > Telegram > Battery > Unrestricted (so alerts are not delayed).

## 3. Tests (replace KEY and the address)
Wake (no key):   curl https://campusbuy-backend-nkmx.onrender.com/betking/wake
Both channels:   curl -X POST https://campusbuy-backend-nkmx.onrender.com/betking/test-alert -H "x-sync-key: KEY" -H "content-type: application/json" -d '{}'
  -> {"ok":true,"email":{"ok":true,...},"telegram":{"ok":true,...}}  and a message on the phone and in bootstrap199502@gmail.com
Fake 6-0:        see the earlier /betking/win test (the eventId must be new each time)
Fake low balance:
  curl -X POST .../betking/low-balance -H "x-sync-key: KEY" -H "content-type: application/json" -d '{"eventId":"t1","project":"Cataloguea La Liga","account":{"name":"setup1"},"balance":4750,"threshold":5000,"occurredAt":"2026-11-17T10:00:00Z"}'
Fake notice:
  curl -X POST .../betking/lifecycle -H "x-sync-key: KEY" -H "content-type: application/json" -d '{"eventId":"t2","project":"Cataloguea La Liga","event":"started","account":{"name":"main"},"occurredAt":"2026-11-17T10:00:00Z"}'

## 4. What now happens (Lagos time)
- 23:55 and 07:55: a WAKE call to the backend. It carries on by itself; betting is never held up.
- 23:59: a SAVE to the server (like pressing u). New bets wait only until the server answers.
- Every alert, email AND Telegram: 6-0 win, balance under N5,000 (names the account), started, resumed, ended.
  Every subject starts with [Cataloguea La Liga]. Email goes to bootstrap199502@gmail.com.
- If Telegram is not set up, email still goes out (and the other way round).

Project settings (all optional): LALIGA_PROJECT_NAME, LALIGA_ACCOUNT_LABEL, LALIGA_LOW_BALANCE (default 5000, 0 = off),
LALIGA_WAKE_TIMES (23:55,07:55), LALIGA_SAVE_TIMES (23:59), LALIGA_TZ (Africa/Lagos), LALIGA_WAKE=off, LALIGA_AUTOSAVE=off,
LALIGA_WAKE_URLS (extra servers to wake at the wake times, comma separated).

## 5. EMRAN cron jobs (same backend): started / ended notices with the project name
Not edited here (different project). In each cron job, for example Utils/milestoneBirthdayReminder.js:
  const { announce } = require('./betkingMail');
  // at the start of the job:  await announce({ project: 'EMRAN milestone reminder', event: 'started' });
  // at the end:               await announce({ project: 'EMRAN milestone reminder', event: 'ended', detail: { status: 'DONE', message: `${n} emails sent` } });
announce() never throws, so a failed alert can never break the job.
The 07:55 wake only helps while the Cataloguea run is on at that time.

## 6. THE DAILY CYCLE (new): work until 23:59, rest, start again every 72 hours
Extra files:  project/laliga-cycle.js (NEW)   project/automation/sync/restCycle.js (NEW)   project/start-laliga.sh (play now runs laliga-cycle.js)
              (laliga-run.js is updated again: it replaces the one listed in section 1)
How it works (Lagos time):
- ./launch.sh starts laliga-cycle.js, which starts laliga-run.js with the daily rest switched on and wakes the backend first.
- 23:59: the run finishes the round in hand (bets being placed, the game being waited for or watched), settles it, does a
  FINAL SAVE to the backend, sends the "ended" notice, and shuts down (exit code 10 = scheduled rest).
- The supervisor waits (it checks the clock every 30 seconds, so a sleeping laptop cannot oversleep), keeps the 23:55 and
  07:55 wake calls going, and at 00:00 on the 3rd day (days = LALIGA_CYCLE_DAYS, default 3) it wakes the backend and starts
  the run again. The run then fetches the newest state from the backend and carries on. The "started" notice says "back after the rest".
- Nothing else is restarted by itself: an error, a halt (for example an unconfirmed bet), Ctrl-C or x ends everything, because
  real money needs your eyes first.
- Started by hand during a rest? It waits for the rest to end. Use:  ./launch.sh --now   to skip the rest.
- Settings: LALIGA_CYCLE_DAYS (3 = every 72 hours between starts; 4 would mean 3 full days off), LALIGA_REST_AT (23:59),
  LALIGA_REST=off (no daily rest), LALIGA_TZ (Africa/Lagos).
- Oracle server later: run the same command under systemd (Restart=no); the rest file in automation/artifacts survives a reboot.
