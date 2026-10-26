# Migration conventions

This is the canonical reference for how schema/data changes work in this
repo: the full rules and the reasoning behind them. AGENTS.md states the hard
rules in short.

## Migration files are immutable history

> Decision: [0001. Migrations are immutable and forward-only](../adr/0001-migrations-are-immutable-and-forward-only.md).

Every schema or data change is a **new forward migration file** in
`migrations/`. Never edit or delete a migration that has run in any real
environment — local dev included, once it's meant to reflect reality — because
doing so desyncs the `schema_migrations` tracking table from what the database
actually contains.

The runner (`src/lib/platform/migrate.server.ts`) partly enforces this already: every
already-applied file's checksum is recomputed and compared on each run, and a
mismatch aborts the whole run before anything executes ("Migration ... was
modified after being applied"). What it can't catch is a file being deleted
outright — that's a process rule, not a technical one: **don't do it.** If a
migration turns out to be wrong, add a new migration that corrects it forward.

The one deletion that is sanctioned is a squash
([Squashing is milestone-only](#squashing-is-milestone-only-not-routine)): the
files go together, and a baseline takes their place whose header lists each of
them with its checksums, so the runner still tells a database that applied
them from one that didn't ([The baseline](#the-baseline)).

## Forward-only — no down-migrations

There is no down-migration / rollback mechanism. Rollback for a real
deployment means **restoring from backup** (see the backup slice), not
reversing a migration. Down-migrations are frequently wrong or dangerous in
practice (they're rarely exercised, so they rot); forward-only plus backups is
simpler and safer for this single-host deployment.

For local dev, since data is disposable, "rollback" just means dropping your
local database and letting `npm run db:migrate` rebuild it from `migrations/`.

## `schema.sql` is a derived snapshot, not an applied artifact

`schema.sql` documents "what the schema looks like right now," for review and
onboarding. It is:

- **generated**, via `pg_dump --schema-only` against a live, fully-migrated
  database — never hand-written,
- **never applied** to any database — `migrations/` is the only thing that
  builds or updates a database,
- **regenerated after every migration** and committed alongside it.

Regenerate it with:

```bash
npm run db:dump-schema -- --container=<postgres-container-name>
```

For example, `--container=my-postgres` if that is what your local Postgres
container is called. This requires:

- Docker, with a running container for the Postgres server you want to
  snapshot (any container running the official `postgres` image has
  `pg_dump` inside it, guaranteed to match the server version exactly — no
  local `pg_dump` install needed on the host),
- `DATABASE_URL` pointing at the database to snapshot — normally your local
  dev database, fully migrated (`npm run db:migrate` first).

There is no default container name — pass `--container` explicitly every
time. `schema.sql` is meant to snapshot whichever database you actually
migrated, which is as often a hand-rolled local dev container as the compose
stack's `postgres` service, so neither is a safe default to assume.

A few notes on the generated output:

- **`\restrict` / `\unrestrict` lines**: newer `pg_dump` versions (16.10+)
  bracket the dump in these psql metacommands as a safety feature. They're
  inert here since `schema.sql` is never fed to `psql` — left in place rather
  than stripped out, so the file stays a faithful, unedited `pg_dump` output.
- **`schema_migrations` is excluded** (`--exclude-table=schema_migrations`)
  — it's the migration runner's own bookkeeping table, not part of the
  application schema being documented.

## Squashing is milestone-only, not routine

Default stance: **keep history append-only.** Dozens of migration files are
fine and expected over time — don't fold them into the baseline periodically
just for tidiness.

Only squash `migrations/0001..00NN` into a new baseline when it's a real
milestone. A database that has applied all of them is adopted by its next
migrate; one that hasn't is refused and upgrades through the tag
([Across the baseline](../guides/upgrading.md#across-the-baseline)),
so bring every live database to `00NN`
first. Procedure:

1. **Tag** the last commit with the individual files, annotated. The
   baseline's `upgrade-through:` names the tag, and it is the way through for
   every database short of `00NN`.
2. **Generate** the baseline, with `DATABASE_URL` naming a test database:
   ```bash
   npm run db:generate-baseline -- --out=<scratch>/0001_baseline.sql --container=<postgres-container-name> --upgrade-through=<tag>
   ```
   `scripts/generate-baseline.ts` builds a scratch database beside the one
   `DATABASE_URL` names with every migration, never touching that one or a
   real one, and dumps it: the schema and the seed rows, their timestamps
   turned into `now()` and their ids fixed in the order they appear, without
   the session settings and psql commands pg_dump writes. It adds the role
   block no dump can carry (a role is the cluster's, and its default
   privileges name the role that ran them), puts the header above, and drops
   the scratch database. Generated again, it comes out byte for byte the
   same.
3. **Check** it:
   ```bash
   npm run db:generate-baseline -- --check=<scratch>/0001_baseline.sql --container=<postgres-container-name> --schema=schema.sql
   ```
   One scratch database is built by the migrations, one by the candidate
   alone. Their schema dumps, privileges, seed rows and extensions must be
   equal, and the candidate's schema the same as `schema.sql`'s; the check
   names what differs, and drops both.
4. **Replace** the files: delete `0001..00NN`, and move the candidate in as
   `migrations/0001_baseline.sql`.
5. **Run the gate** (`npm run gate`): every test database is then built from
   the baseline.
6. **Adopt**: on every real database the next `npm run db:migrate` records
   the baseline in their place without running its body
   ([The baseline](#the-baseline)). Rehearse it first on a scratch restore of
   that database's backup.

The baseline's body only **executes** on an empty database (a brand-new
install); everywhere else it's adopted. On PowerShell, run the script as
`npx tsx scripts/generate-baseline.ts …` (`docs/guides/backup.md`, "Windows
PowerShell").

### Setup-specific caveat

Any squashed or regenerated baseline must still reproduce this app's
generated full-text-search columns (`to_tsvector(<a CASE over search_locale>, ...)`,
on `pages.search_tsv` and `documents.search_tsv`) and extension ordering
(currently just `pgcrypto`) **exactly** — extensions and functions have to be
created before anything that depends on them. This repo doesn't use pgvector
today, but the same ordering concern would apply the moment it's added.

This is precisely *why* baselines (including `schema.sql`) are pg_dump
snapshots of a real database rather than hand-written SQL: `pg_dump` always
emits objects in a topologically valid order on its own, so this whole class
of "generated column defined before its dependency" bug simply can't recur.
The generator dumps one database whole, extensions first, and its check
compares a database built by the candidate with one the migrations built.

## The migration runner, briefly

(Full detail lives in the code — `src/lib/platform/migrate.server.ts` — this is the
summary.)

- **Tracking**: `schema_migrations(version, filename, checksum, applied_at)`,
  bootstrapped idempotently on every run.
- **Order**: by version number, so `10000_…` follows `9999_…`; two files of
  one number (`0010_…` and `10_…`) are refused.
- **Statements**: a file runs statement by statement, cut at each top-level
  `;` — never inside a quoted string, a quoted identifier, a dollar-quoted
  body (`$$…$$`, `$tag$…$tag$`) or a comment (`--`, `/* … */`), which are
  dropped outside those. One of them left open is refused, naming the file
  and the line it opens on, before any of the file runs and with nothing
  recorded: it would swallow the rest of the file. Block comments nest, as
  Postgres reads them, so `/* reads docs/*.md */` is left open — its `/*`
  opens a second comment, which the `*/` closes.
- **Checksums ignore line endings**: the checksum is taken over the file with
  CRLF normalized to LF, so a database migrated from a Windows checkout accepts
  an image built on Linux and vice versa. `.gitattributes` also pins
  `*.sql` to LF in every working tree.
- **Advisory lock**: the whole run holds a Postgres advisory lock (via a
  reserved connection — `sql.reserve()`, not the pooled `sql` tag, since
  `pg_advisory_lock`/`unlock` are session-scoped) so two concurrent
  `db:migrate` runs can't collide.
- **Per-file transactions**: an ordinary `NNNN_description.sql` file runs
  inside one transaction — the whole file lands or none of it does — and the
  `schema_migrations` row is inserted in the same transaction.
- **`CREATE INDEX CONCURRENTLY` exception**: name the file
  `NNNN_description.no-tx.sql`. The runner executes it outside a transaction,
  statement-by-statement (Postgres refuses `CONCURRENTLY` inside a
  transaction block). Example:
  ```sql
  -- migrations/0002_add_some_index.no-tx.sql
  -- CONCURRENTLY cannot run inside a transaction; this file runs outside a
  -- transaction. If it fails partway, run
  -- `drop index concurrently if exists pages_some_idx;` before retrying.
  create index concurrently if not exists pages_some_idx on pages (some_column);
  ```
- **Baseline adoption**: before anything else, a run compares
  `schema_migrations` with the baseline's header, and records the baseline in
  place of what it replaces or refuses the database
  ([The baseline](#the-baseline)). It comes before the checksum check: until
  then, the baseline's version is recorded with the checksum of the file it
  replaced.
- **Recording a migration without running it**, for a database whose schema
  was made by other means and has no rows:
  ```bash
  npm run db:migrate -- --mark-applied=<version>
  ```
  It refuses a database the baseline refuses, and one that has applied every
  migration the baseline replaces: `npm run db:migrate` adopts that one.

## The baseline

> Decision: [0016. Migrations squash into a baseline at a milestone](../adr/0016-migrations-squash-into-a-baseline-at-a-milestone.md).

A squash replaces the migrations up to a milestone by one file, the
**baseline**: the lowest-numbered file in `migrations/`. It keeps version
`0001` and the name `0001_baseline.sql`, so a database adopted on the way and
a new one record the same single row. It builds what they built (the schema,
the seed rows, the app's role and its grants), it is generated and checked by
`npm run db:generate-baseline` and never written by hand
([Squashing is milestone-only](#squashing-is-milestone-only-not-routine)),
and its header says what it stands for:

```sql
-- upgrade-through: <tag>
-- replaces: 0001 0001_baseline.sql <sha256 of the LF text> <sha256 of the CRLF text>
-- replaces: 0002 0002_app_role.sql <…> <…>
```

- **`replaces:`** names each migration it stands for, with both checksums a
  row may hold (see "Checksums ignore line endings" above). The list is part
  of the file, so the baseline's own checksum covers it: a list edited after
  adoption is a modified migration like any other.
- **`upgrade-through:`** names the release tag of the last commit that still
  has the individual files.
- Only the lowest-numbered file may have these lines. A malformed or repeated
  one, or one in any other file, stops the run before the database is read.
  They are comments, so they never execute.
- A folder whose lowest file has no header has no baseline, and the runner
  works as the rest of this page describes.

On each run, under the advisory lock, the runner reads `schema_migrations`
against the header (`src/lib/platform/baseline.server.ts`):

| The database records | The run |
|---|---|
| nothing | runs the baseline like any file, then the files after it |
| the baseline | goes on as usual |
| every migration the header lists, each under its file name and one of its checksums | **adopts** the database: in one transaction it replaces their rows by the baseline's, without running its body, then applies the files after it. It prints `Adopted 0001_baseline.sql in place of <n> migrations, without running it.` Rows the header doesn't list (a branch's, say) are kept, and the run's log names them. |
| only some of them | **refuses**, changing nothing, and names the tag to upgrade through ([Across the baseline](../guides/upgrading.md#across-the-baseline)) |
| one of them under another name or checksum | refuses: that migration was edited after being applied, so the baseline cannot stand in for what it built |
| rows, but neither the baseline nor any it lists | refuses: the database was not built by these migrations |

Versions are matched together with file name and checksum, so a file after
the baseline may take a number it replaced. A refusal is one line on stderr
and exit code 1: in compose, what `docker compose logs migrate` shows. The
About page (`/-/about`, with `installation:view`) shows the same, before
migrate runs: what the next run adopts, or that it refuses.

**Going back after adoption is a restore.** The release before the squash
refuses an adopted database, since its own `0001_baseline.sql` no longer
matches the recorded checksum; restore the backup taken before the adoption
instead.

## Names

Every constraint and index carries the suffix Postgres gives its kind:

| Kind | Name |
|---|---|
| primary key | `<table>_pkey` |
| unique constraint | `<table>_<columns>_key` |
| foreign key | `<table>_<columns>_fkey` |
| check | `<table>_<what>_check` |
| any other index, a unique one included | `<table>_<what>_idx` |

A constraint left unnamed gets exactly this name from Postgres, so the rule
costs nothing to keep. One named by hand, because its columns don't say what
it holds, still ends in its kind's suffix: `nodes_class_type_fkey`,
`namespaces_slug_null_iff_default_check`. Code that tells a violation apart by
its `constraint_name` names it so too. `src/lib/platform/schemaNames.int.test.ts`
holds the rule on a fully migrated database.

## Adding a migration — checklist

1. Create `migrations/000N_description.sql` (next 4-digit number), or
   `.no-tx.sql` if it contains a statement that can't run in a transaction.
   It starts with the licence header, as every source file does
   (CONTRIBUTING.md), written before the file is first applied:
   `npm run license-headers` never writes into `migrations/`, since adding
   the header to an applied migration changes its checksum.
2. Write it idempotently where practical (`create table if not exists`,
   `add column if not exists`, etc.) — cheap insurance, not a substitute for
   the tracking table.
3. Data migrations (backfills, transforms) are plain SQL too — write an
   `update ...` migration rather than a new one-off script.
4. Run `npm run db:migrate` locally to verify it applies cleanly.
5. Run `npm run db:dump-schema -- --container=<name>` to regenerate
   `schema.sql`.
6. Commit both the migration file and the regenerated `schema.sql` together.
