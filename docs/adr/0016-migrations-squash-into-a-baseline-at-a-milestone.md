---
status: accepted
date: 2026-10-25
---

# 0016. Migrations squash into a baseline at a milestone

## Context

Forward-only migrations ([0001](0001-migrations-are-immutable-and-forward-only.md))
make the history long: by its first public release owlgraph had 59, among
them renames, clean-ups and data rewrites that no new installation needs to
replay. Existing databases had run them all, and cannot run a replacement as
if it were new.

## Decision

At a milestone — a release, never routinely — the migrations are squashed
into one **baseline**, generated from a database migrated to the end of the
history, whose header lists every migration it replaces with its checksum.
The runner then adopts it by what a database holds:

- an empty database runs the baseline;
- a database that applied every replaced migration, checksums matching, has
  the baseline recorded in their place, and nothing is run;
- a database with only some of them is refused before anything changes, and
  the message names the release to upgrade through first.

The last release before a squash is tagged, so an older installation upgrades
in two hops, with a backup before each: first to that release, then to the
squashed one.

## Consequences

- A new installation runs one file, and the schema's history starts clean at
  the milestone.
- The squash is the one change a migration's immutability allows, and only
  because adoption proves the database is exactly what the history built.
- Upgrading across a squash takes two steps, documented in the upgrade guide.

## Alternatives considered

- **Never squashing**: every installation replays every rename forever.
- **A baseline that runs everywhere**: it would fail, or worse, half-apply, on
  a database that already has the schema.

See [The baseline](../architecture/migrations.md#the-baseline).
