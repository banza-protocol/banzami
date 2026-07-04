# Backup & Disaster Recovery Runbook

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 · addresses RA-006

## What runs today

- **Script:** `infra/deployment/pg-backup.sh` (deployed to `/srv/banzami/scripts/pg-backup.sh`).
- **Schedule:** `pg-backup.timer` — every 6 hours, `Persistent=true` (catch-up), enabled.
- **Scope:** every non-template database (currently `banzami_staging`; the live
  `banzami` DB does not exist yet).
- **Format:** compressed custom-format (`pg_dump -Fc`), executed inside the
  `banzami-postgres-1` container.
- **Retention:** 14 days local, age-rotated.
- **Restore verification:** each run restores the latest dump into a throwaway
  scratch database and asserts the schema materialized (table count > 0), then
  drops it. Verified 2026-07-04: 85 tables materialize cleanly.
- **Fail-loud gaps:** the run WARNs (and the timer surfaces it) when encryption
  or off-host copy are not configured — a host-only backup does not survive
  host loss.

## Required for the LIVE activation gate (not yet configured — tracked)

These are provisioning decisions (need a storage target + keypair) and must be
in place before Live (see `docs/operations/LIVE_ACTIVATION_GATE.md` item 8):

1. **Encryption (asymmetric).** Generate a backup keypair; keep the PRIVATE key
   OFF the host (operator secrets vault). Set `BACKUP_GPG_RECIPIENT=<pubkey id>`
   and import only the PUBLIC key on the host. The host can then encrypt but
   NOT decrypt — a host compromise does not expose backup contents.
2. **Off-host storage.** Provision a dedicated, access-controlled backup bucket
   (separate from the KYC/KYB buckets). Set
   `BACKUP_OFFHOST_CMD="rclone copyto ... "` (or an `aws s3 cp` wrapper). The
   script fails loud until this is set.
3. **Retention policy at rest** on the bucket (lifecycle rules + object lock for
   immutability) in addition to the 14-day local window.

## Restore procedure (into a scratch target — never overwrite prod blind)

```bash
# 1. Fetch the desired dump (off-host or local) to the host.
# 2. If encrypted, decrypt OFF-HOST with the private key:
gpg -o restore.dump -d banzami_YYYYMMDDTHHMMSSZ.dump.gpg
# 3. Copy into the container and restore into a NEW scratch DB first:
docker cp restore.dump banzami-postgres-1:/tmp/restore.dump
docker exec banzami-postgres-1 psql -U banzami -d postgres -c "CREATE DATABASE restore_check;"
docker exec banzami-postgres-1 pg_restore -U banzami -d restore_check --no-owner --no-acl /tmp/restore.dump
# 4. Verify row counts / ledger integrity in restore_check BEFORE any cutover.
# 5. Only after verification, plan the cutover (stop services, rename, restore).
```

## Alerting

The systemd service exits non-zero on any dump/restore/off-host failure; a
failed run is visible via `systemctl status pg-backup.service` and the journal.
Wire a journal-failure alert (e.g. `OnFailure=` unit or a log shipper) before
Live. Do NOT place raw data or credentials in any alert or evidence artifact.

## Evidence

- Timer enabled + 6-hourly schedule: `systemctl list-timers pg-backup.timer`.
- Restore-verify green (85 tables): `pg-backup.sh` run log 2026-07-04.
- Defense in depth: verify the IONOS provider-level VM snapshot policy
  independently (separate from these logical dumps).
