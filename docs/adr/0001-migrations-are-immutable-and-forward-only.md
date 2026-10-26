---
status: accepted
date: 2026-07-29
---

# 0001. Migrations are immutable and forward-only

## Context

owlgraph's schema and its seed data change with almost every feature, and the
databases that hold real content — a developer's, a demo, a deployment —
upgrade at different times. A schema that is changed by hand, or by editing a
migration that already ran, drifts from what the code expects, and the drift
shows up only when something breaks.

## Decision

Every change to the schema or to stored data is a new SQL migration, applied
by the migration runner and recorded with its checksum. A migration that has
run anywhere is never edited or deleted; the runner refuses a recorded
migration whose file no longer matches. There are no down-migrations: going
back means restoring a backup. `schema.sql` is a snapshot generated from a
migrated database, never applied anywhere.

## Consequences

- Every database that ran the same migrations has the same schema, and the
  migration files are its history.
- A mistake in an applied migration is corrected by another migration, never
  by editing the first.
- Rolling back depends on backups, so the backup and restore commands — and
  proving a backup restores — are part of the system
  ([backup.md](../guides/backup.md)).
- The history grows with every change; it is squashed only at a milestone
  ([0016](0016-migrations-squash-into-a-baseline-at-a-milestone.md)).

## Alternatives considered

- **Down-migrations.** A down step is code that runs rarely and is tested
  less, against data that has moved on since the up step; a restore gives a
  known state instead.
- **A schema diffed from a declared model.** It leaves data changes, renames
  and backfills to hand-written steps anyway, and makes the order of changes
  implicit.

See [migrations.md](../architecture/migrations.md).
