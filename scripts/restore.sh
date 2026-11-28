#!/usr/bin/env bash
# Restore Cataloguea backups after a failed update or server recovery.
# Run on the server.
# Usage: send this script over SSH, optionally with a backup prefix
#   backup-prefix is the date part, e.g. cataloguea-backup-20261116-120000
# If omitted, the most recent backup is used.
#
# Before extracting, every archive is integrity-checked (tar -tzf) and the
# manifest checksums are re-verified. The service is only restarted if the
# restore completes successfully. Nothing is restored unless the backup set
# passes verification.

set -euo pipefail

BACKUP_PREFIX="${1:-}"
PROJECT_DIR="${CATALOGUEA_PROJECT_DIR:-/home/ubuntu/Cataloguea}"
BACKUP_DIR="${CATALOGUEA_BACKUP_DIR:-/home/ubuntu/cataloguea-backups}"
PROFILE_DIR="${CATALOGUEA_PROFILE_DIR:-/home/ubuntu/.cataloguea}"

RESTORE_OK=0
FAILED_COMPONENTS=()

select_backup_prefix() {
  LATEST_MANIFEST=$(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'cataloguea-backup-*-manifest.txt' \
      -printf '%T@ %f\n' 2>/dev/null |
      sort -nr |
      head -1 |
      cut -d ' ' -f 2- || true
  )
  if [ -z "$LATEST_MANIFEST" ]; then
    echo "ERROR: No backups found in $BACKUP_DIR" >&2
    exit 1
  fi
  echo "${LATEST_MANIFEST%-manifest.txt}"
}

if [ -z "$BACKUP_PREFIX" ]; then
  BACKUP_PREFIX="$(select_backup_prefix)"
  echo "Using most recent backup: $BACKUP_PREFIX"
fi

if [[ ! "$BACKUP_PREFIX" =~ ^cataloguea-backup-[0-9]{8}-[0-9]{6}$ ]]; then
  echo "ERROR: Backup prefix must look like cataloguea-backup-YYYYMMDD-HHMMSS." >&2
  exit 2
fi

BASENAME="$BACKUP_PREFIX"
MANIFEST="$BACKUP_DIR/$BASENAME-manifest.txt"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: Backup manifest not found: $MANIFEST" >&2
  exit 1
fi

echo "=== Restoring from: $BASENAME ==="
echo ""

# --- Pre-flight: disk space check ---
AVAIL_KB=$(df --output=avail "$PROJECT_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt 102400 ]; then
  echo "ERROR: Less than 100 MB free in $PROJECT_DIR; aborting restore." >&2
  exit 1
fi

# --- Verify manifest checksums before extracting anything ---
echo "Verifying backup integrity..."
while IFS= read -r line; do
  # Match lines like: "  - cataloguea-backup-...-browser-profile.tar.gz  sha256=abc...  size=123"
  case "$line" in
    *"  sha256="*"  size="*)
      # Extract archive name (between "  - " and "  sha256=")
      ARCHIVE_NAME="${line#*  - }"
      ARCHIVE_NAME="${ARCHIVE_NAME%%  sha256=*}"
      # Extract SHA (between "sha256=" and "  size=")
      EXPECTED_SHA="${line#*sha256=}"
      EXPECTED_SHA="${EXPECTED_SHA%%  size=*}"
      # Extract size (after "size=")
      EXPECTED_SIZE="${line##*size=}"
      ARCHIVE_PATH="$BACKUP_DIR/$ARCHIVE_NAME"

      if [ ! -f "$ARCHIVE_PATH" ]; then
        echo "ERROR: Manifest references missing archive: $ARCHIVE_NAME" >&2
        exit 1
      fi

      ACTUAL_SHA=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
      if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
        echo "ERROR: Checksum mismatch for $ARCHIVE_NAME (expected $EXPECTED_SHA, got $ACTUAL_SHA)" >&2
        exit 1
      fi

      ACTUAL_SIZE=$(stat -c '%s' "$ARCHIVE_PATH" 2>/dev/null || echo '0')
      if [ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]; then
        echo "ERROR: Size mismatch for $ARCHIVE_NAME (expected $EXPECTED_SIZE, got $ACTUAL_SIZE)" >&2
        exit 1
      fi

    # Integrity-check the archive if it is a tarball; plain files are
    # already verified by checksum and size above.
    if [[ "$ARCHIVE_NAME" == *.tar.gz ]]; then
      if ! tar -tzf "$ARCHIVE_PATH" >/dev/null 2>&1; then
        echo "ERROR: Archive integrity check failed for $ARCHIVE_NAME" >&2
        exit 1
      fi
    fi

      echo "  Verified: $ARCHIVE_NAME"
      ;;
  esac
done < "$MANIFEST"

echo "Backup integrity verified."
echo ""

# --- Stop the service before restoring ---
echo "Stopping cataloguea service..."
sudo systemctl stop cataloguea 2>/dev/null || true

# --- Restore: browser profile ---
if [ -f "$BACKUP_DIR/$BASENAME-browser-profile.tar.gz" ]; then
  echo "Restoring browser profile..."
  mkdir -p "$PROFILE_DIR"
  if ! tar -xzf "$BACKUP_DIR/$BASENAME-browser-profile.tar.gz" -C "$PROFILE_DIR"; then
    echo "ERROR: Failed to extract browser profile archive." >&2
    RESTORE_OK=1
    FAILED_COMPONENTS+=("browser-profile")
  else
    echo "  Browser profile: restored"
  fi
else
  echo "  Browser profile: not in backup set (skipped)"
fi

# --- Restore: automation artifacts ---
if [ -f "$BACKUP_DIR/$BASENAME-artifacts.tar.gz" ]; then
  echo "Restoring automation artifacts..."
  if ! tar -xzf "$BACKUP_DIR/$BASENAME-artifacts.tar.gz" -C "$PROJECT_DIR"; then
    echo "ERROR: Failed to extract artifacts archive." >&2
    RESTORE_OK=1
    FAILED_COMPONENTS+=("artifacts")
  else
    echo "  Automation artifacts: restored"
  fi
else
  echo "  Automation artifacts: not in backup set (skipped)"
fi

# --- Restore: sync configuration ---
if [ -f "$BACKUP_DIR/$BASENAME-sync-config.json" ]; then
  echo "Restoring sync config..."
  mkdir -p "$PROJECT_DIR"
  if ! cp "$BACKUP_DIR/$BASENAME-sync-config.json" "$PROJECT_DIR/laliga-sync.json"; then
    echo "ERROR: Failed to copy sync config." >&2
    RESTORE_OK=1
    FAILED_COMPONENTS+=("sync-config")
  else
    chown ubuntu:ubuntu "$PROJECT_DIR/laliga-sync.json" 2>/dev/null || true
    chmod 600 "$PROJECT_DIR/laliga-sync.json"
    echo "  Sync config: restored"
  fi
else
  echo "  Sync config: not in backup set (skipped)"
fi

# --- Report ---
if [ "$RESTORE_OK" -eq 0 ]; then
  # Only restart the service if everything restored successfully.
  echo "Starting cataloguea service..."
  if ! sudo systemctl start cataloguea 2>/dev/null; then
    echo "WARNING: Could not start cataloguea service (may require sudo or systemd)." >&2
    echo "Data was restored successfully; start the service manually with:" >&2
    echo "  sudo systemctl start cataloguea" >&2
  fi
  echo ""
  echo "=== Restore complete ==="
  echo "Check status: sudo systemctl status cataloguea"
  echo "Follow logs: journalctl -u cataloguea -f"
else
  echo ""
  echo "=== Restore completed with failures ==="
  echo "Failed components: ${FAILED_COMPONENTS[*]}"
  echo "The cataloguea service was NOT restarted."
  echo "Inspect the errors above and retry or contact support."
  exit 1
fi
