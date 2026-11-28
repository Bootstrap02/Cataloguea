#!/usr/bin/env bash
# Backup Cataloguea persistent data (browser profile, strategy state, sync config)
# Run from the local infrastructure checkout and send the script over SSH:
#   ssh ubuntu@<instance-ip> 'bash -s' < scripts/backup.sh
#
# The application directory can be overridden with CATALOGUEA_PROJECT_DIR
# (default: /home/ubuntu/Cataloguea). The sync config file is laliga-sync.json
# in the application root. It contains sensitive sync credentials.
#
# Creates timestamped backup archives, verifies each archive is readable,
# writes a manifest with SHA-256 checksums, and retains the seven most
# recent successful backup sets. Older backups are only removed after a
# new backup has been fully verified.

set -euo pipefail
umask 077

BACKUP_DIR="${CATALOGUEA_BACKUP_DIR:-/home/ubuntu/cataloguea-backups}"
PROJECT_DIR="${CATALOGUEA_PROJECT_DIR:-/home/ubuntu/Cataloguea}"
PROFILE_DIR="${CATALOGUEA_PROFILE_DIR:-/home/ubuntu/.cataloguea}"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="cataloguea-backup-$DATE"

# Track overall success. Any failure sets this to non-zero and causes
# a non-zero exit without deleting older backups.
BACKUP_OK=0
FAILED_COMPONENTS=()

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

WORK_MANIFEST="$BACKUP_DIR/$BACKUP_NAME-manifest.txt.tmp"
FINAL_MANIFEST="$BACKUP_DIR/$BACKUP_NAME-manifest.txt"

cleanup_partial() {
  # Remove any incomplete files from this backup attempt so a failed
  # run is never mistaken for a successful one.
  rm -f -- "$WORK_MANIFEST" \
    "$BACKUP_DIR/$BACKUP_NAME"-browser-profile.tar.gz \
    "$BACKUP_DIR/$BACKUP_NAME"-artifacts.tar.gz \
    "$BACKUP_DIR/$BACKUP_NAME"-sync-config.json 2>/dev/null || true
}

trap cleanup_partial EXIT

echo "=== Creating backup: $BACKUP_NAME ==="
echo ""

# --- Pre-flight: disk space check ---
AVAIL_KB=$(df --output=avail "$BACKUP_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt 102400 ]; then
  echo "ERROR: Less than 100 MB free in $BACKUP_DIR; aborting backup." >&2
  exit 1
fi

# --- Component: browser profile ---
if [ -d "$PROFILE_DIR" ]; then
  if tar -czf "$BACKUP_DIR/$BACKUP_NAME-browser-profile.tar.gz" -C "$PROFILE_DIR" . 2>/dev/null; then
    if tar -tzf "$BACKUP_DIR/$BACKUP_NAME-browser-profile.tar.gz" >/dev/null 2>&1; then
      echo "  Browser profile: backed up"
    else
      echo "  Browser profile: archive integrity check FAILED" >&2
      rm -f -- "$BACKUP_DIR/$BACKUP_NAME-browser-profile.tar.gz"
      BACKUP_OK=1
      FAILED_COMPONENTS+=("browser-profile")
    fi
  else
    echo "  Browser profile: archive creation FAILED" >&2
    rm -f -- "$BACKUP_DIR/$BACKUP_NAME-browser-profile.tar.gz"
    BACKUP_OK=1
    FAILED_COMPONENTS+=("browser-profile")
  fi
else
  echo "  Browser profile: not found (first run)"
fi

# --- Component: automation artifacts ---
if [ -d "$PROJECT_DIR/automation/artifacts" ]; then
  if tar -czf "$BACKUP_DIR/$BACKUP_NAME-artifacts.tar.gz" -C "$PROJECT_DIR" automation/artifacts 2>/dev/null; then
    if tar -tzf "$BACKUP_DIR/$BACKUP_NAME-artifacts.tar.gz" >/dev/null 2>&1; then
      echo "  Automation artifacts: backed up"
    else
      echo "  Automation artifacts: archive integrity check FAILED" >&2
      rm -f -- "$BACKUP_DIR/$BACKUP_NAME-artifacts.tar.gz"
      BACKUP_OK=1
      FAILED_COMPONENTS+=("artifacts")
    fi
  else
    echo "  Automation artifacts: archive creation FAILED" >&2
    rm -f -- "$BACKUP_DIR/$BACKUP_NAME-artifacts.tar.gz"
    BACKUP_OK=1
    FAILED_COMPONENTS+=("artifacts")
  fi
else
  echo "  Automation artifacts: not found"
fi

# --- Component: sync configuration ---
if [ -f "$PROJECT_DIR/laliga-sync.json" ]; then
  if cp "$PROJECT_DIR/laliga-sync.json" "$BACKUP_DIR/$BACKUP_NAME-sync-config.json" 2>/dev/null; then
    chmod 600 "$BACKUP_DIR/$BACKUP_NAME-sync-config.json"
    echo "  Sync config: backed up"
  else
    echo "  Sync config: copy FAILED" >&2
    rm -f -- "$BACKUP_DIR/$BACKUP_NAME-sync-config.json"
    BACKUP_OK=1
    FAILED_COMPONENTS+=("sync-config")
  fi
else
  echo "  Sync config: not found (sync not configured)"
fi

# --- Compute checksums for every archive that exists ---
{
  echo "Backup created: $(date)"
  echo "Hostname: $(hostname)"
  echo "Git commit: $(cd "$PROJECT_DIR" && git rev-parse HEAD 2>/dev/null || echo 'unknown')"
  echo "Git branch: $(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo 'unknown')"
  echo "Overall status: $([ "$BACKUP_OK" -eq 0 ] && echo OK || echo PARTIAL_FAILURE)"
  echo "Failed components: ${FAILED_COMPONENTS[*]:-(none)}"
  echo "Files:"
  for f in "$BACKUP_DIR/$BACKUP_NAME"-browser-profile.tar.gz \
           "$BACKUP_DIR/$BACKUP_NAME"-artifacts.tar.gz \
           "$BACKUP_DIR/$BACKUP_NAME"-sync-config.json; do
    if [ -f "$f" ]; then
      SUM=$(sha256sum "$f" | awk '{print $1}')
      SIZE=$(stat -c '%s' "$f" 2>/dev/null || echo 'unknown')
      printf '  - %s  sha256=%s  size=%s\n' "$(basename "$f")" "$SUM" "$SIZE"
    fi
  done
} > "$WORK_MANIFEST"

# Only promote the manifest to final if at least one component succeeded
# and the overall status is OK. If everything failed, leave the .tmp file
# as evidence and exit non-zero.
if [ "$BACKUP_OK" -eq 0 ]; then
  mv "$WORK_MANIFEST" "$FINAL_MANIFEST"
  # Remove the trap's cleanup for the manifest now that it is final.
  trap - EXIT
  echo ""
  echo "=== Backup successful ==="
  echo "Location: $BACKUP_DIR"
  echo "Manifest: $FINAL_MANIFEST"
  ls -lh -- "$BACKUP_DIR/$BACKUP_NAME"-* 2>/dev/null || true
else
  trap - EXIT
  rm -f -- "$FINAL_MANIFEST" 2>/dev/null || true
  echo ""
  echo "=== Backup completed with failures ==="
  echo "Location: $BACKUP_DIR"
  echo "Failed components: ${FAILED_COMPONENTS[*]}"
  echo "No older backups were removed."
  exit 1
fi

# --- Retention: keep only the seven newest verified backup sets ---
# Only remove older backups now that the new one is verified and final.
mapfile -d '' -t manifests < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'cataloguea-backup-*-manifest.txt' -printf '%T@ %f\0' |
    sort -z -nr |
    cut -z -d ' ' -f 2-
)

for manifest in "${manifests[@]:7}"; do
  base="${manifest%-manifest.txt}"
  echo "  Removing old backup set: $base"
  rm -f -- "$BACKUP_DIR/$base"-browser-profile.tar.gz \
           "$BACKUP_DIR/$base"-artifacts.tar.gz \
           "$BACKUP_DIR/$base"-sync-config.json \
           "$BACKUP_DIR/$manifest" 2>/dev/null || true
done

echo ""
echo "=== Backup complete ==="
echo "Location: $BACKUP_DIR"
