#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../.." || exit 1
ENV_FILE=/etc/cataloguea.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
STATE_FILE=/var/tmp/cataloguea-watchdog.state
SERVICE=cataloguea
GRACE_MINUTES=30
RESTART_GAP_MINUTES=45

now=$(date +%s)
problems=()

age_minutes() {
  node -e 'try{const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=Date.parse(s.lastVisitAt);console.log(Number.isFinite(t)?Math.floor((Date.now()-t)/60000):99999)}catch(e){console.log(99999)}' "$1"
}

started_at=$(systemctl show "$SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null)
up_minutes=0
if [ -n "$started_at" ]; then up_minutes=$(( (now - $(date -d "$started_at" +%s 2>/dev/null || echo "$now")) / 60 )); fi

if ! systemctl is-active --quiet "$SERVICE"; then
  problems+=("the recorder service is not running")
elif [ "$up_minutes" -ge "$GRACE_MINUTES" ]; then
  for league in epl laliga seriea bundesliga; do
    limit=75
    [ "$league" = bundesliga ] && limit=40
    age=$(age_minutes "automation/artifacts/observer/$league/state.json")
    if [ "$age" -ge 99999 ]; then
      problems+=("$league: no successful recording yet (service up ${up_minutes} minutes)")
    elif [ "$age" -gt "$limit" ]; then
      problems+=("$league: no recording for ${age} minutes (limit ${limit})")
    fi
  done
fi

notify() {
  local url key body
  url=$(node -e 'try{const c=JSON.parse(require("fs").readFileSync("laliga-sync.json","utf8"));console.log(c.url||"")}catch(e){console.log("")}')
  key=$(node -e 'try{const c=JSON.parse(require("fs").readFileSync("laliga-sync.json","utf8"));console.log(c.key||"")}catch(e){console.log("")}')
  if [ -z "$url" ]; then
    echo "ERROR: backend sync URL is not configured; watchdog notice was not sent." >&2
    return 1
  fi
  body=$(node -e 'const [kind,title,message,host]=process.argv.slice(1);const hour=new Date().toISOString().slice(0,13);console.log(JSON.stringify({eventId:`watchdog|${host}|${kind}|${hour}`,project:"Cataloguea Results Recorder (Oracle)",title,message}))' "$1" "$2" "$3" "$(hostname)")
  if ! curl -fsS -m 60 -X POST "${url%/}/betking/notice" \
    -H "x-sync-key: $key" -H 'content-type: application/json' -d "$body" >/dev/null; then
    echo "ERROR: backend did not accept the watchdog notice." >&2
    return 1
  fi
}

ping_healthcheck() {
  [ -n "${HEALTHCHECK_URL:-}" ] || return 0
  if ! curl -fsS -m 10 --retry 2 "${HEALTHCHECK_URL%/}$1" >/dev/null; then
    echo "ERROR: external heartbeat ping failed." >&2
    return 1
  fi
}

last_status=ok
[ -f "$STATE_FILE" ] && last_status=$(cut -d' ' -f1 "$STATE_FILE")
last_restart=0
[ -f "$STATE_FILE" ] && last_restart=$(cut -d' ' -f2 "$STATE_FILE" 2>/dev/null || echo 0)

if [ "${#problems[@]}" -eq 0 ]; then
  if [ "$last_status" = bad ]; then
    notify recovered "RECOVERED: recording again" "The recorder is running and recording again."
  fi
  echo "ok $last_restart" > "$STATE_FILE"
  ping_healthcheck ""
  exit 0
fi

message=$(printf '%s; ' "${problems[@]}")
if [ $(( (now - last_restart) / 60 )) -ge "$RESTART_GAP_MINUTES" ]; then
  if systemctl restart "$SERVICE"; then
    message="${message}The recorder service was restarted."
  else
    message="${message}Automatic service restart failed."
  fi
  last_restart=$now
fi
notify problem "PROBLEM: not recording" "$message"
ping_healthcheck "/fail"
echo "bad $last_restart" > "$STATE_FILE"
exit 0
