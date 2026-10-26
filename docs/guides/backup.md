# Backup & restore

How to back up and restore the compose Postgres, and how to prove a backup
actually works before you need it. See `docs/guides/deployment.md` for the compose
stack itself and `docs/architecture/migrations.md` for the forward-only migration model
this recovery flow depends on.

## The model

Everything the app owns lives in Postgres — including document bytes, stored
as `bytea` — so a `pg_dump` captures the whole app state. There's no separate
file tree to back up. One table's rows are left out on purpose: the images'
WebP copies (`asset_variants`, [media.md](../architecture/media.md#copies-for-smaller-screens))
are derived from the images, and after a restore they are made again the
first time a page asks for them. A link document ([documents.md](../architecture/documents.md#sources))
carries only its external address, which a backup holds like any other
metadata; the file it points to is not the app's to back up.

**One thing is not in the database: `APP_SECRET_KEY`.** An integration's
credentials are stored sealed under it ([authorization.md](../architecture/authorization.md#secrets)),
so a dump holds them as ciphertext — harmless if it leaks, and useless after a
restore without the key. Keep the key wherever the dumps' own secrets are kept
(apart from the dumps); a restore without it keeps everything else, and each
integration's connection — and each person's own connection to it — has to be
made again. A connect in progress (`connection_flows`) is in a dump too, but
is minutes long and bound to its session: after a restore it has long run
out, and a person simply connects again.

- **Backup** is a full `pg_dump -Fc` (custom/compressed format): schema +
  data (all but the image copies' rows) + the `schema_migrations` tracking table. `pg_dump` is a single
  MVCC-consistent snapshot, so **no app downtime is needed** — a running app
  cannot corrupt the dump.
- **Restore** reproduces the dumped point-in-time exactly, then the normal
  migration runner (`src/lib/platform/migrate.server.ts`) carries it **forward** to
  the current app version. Restoring an **older** dump is fine — the
  restored `schema_migrations` table is just behind, and pending migrations
  apply cleanly on top — except one from before the baseline that hasn't
  applied every migration the baseline replaces: it restores through the
  release before the squash
  ([Restoring a backup from before the baseline](#restoring-a-backup-from-before-the-baseline)).
  Restoring a **newer** dump into an **older** app
  checkout is refused — there are no down-migrations (see
  `docs/architecture/migrations.md`), so that would be an unrecoverable downgrade.
  `npm run db:restore` checks for this automatically before touching the
  database (see "Guards" below).
- Backup **storage, rotation, retention, offsite duplication, encryption at
  rest, and scheduling** are not this doc's or these scripts' concern — pick
  a target path/artifact and hand it to whatever infra does that. These
  scripts only produce and consume the artifact itself.

## Where to run this

All three scripts (`db:backup`, `db:restore`, `db:restore-test`) shell out to
`docker compose exec`/`docker compose run` — they need the Docker Compose
CLI and access to the Docker daemon running this compose project. Run them
from the **host** (or any ops machine/CI runner with this repo checked out
and `docker compose` available), from the repo root.

**Not** from inside `app`, `mcp`, or `postgres` — none of those containers
have a Docker CLI or socket access, and shouldn't (giving the app container
Docker socket access would be a real privilege escalation, undoing the
least-privilege set-up in `docs/guides/deployment.md`). Running e.g. `docker
compose exec app npm run db:backup -- ...` will fail for exactly that
reason — `docker` isn't installed in that image, on purpose.

### Targeting a Postgres container outside this compose project

By default the scripts reach Postgres as `docker compose exec -T postgres`,
which only finds the container if this compose project is the one running it.
A local dev database is often a hand-rolled `docker run` container instead —
outside any compose project, and therefore invisible to that command. Point
the scripts at it by name, with either `--container=<name>` or the
`PG_CONTAINER` environment variable (the flag wins):

```bash
PG_CONTAINER=<container> npx tsx scripts/backup.ts --out=./backups/today.dump
npx tsx scripts/restore-test.ts --file=./backups/today.dump --container=<container>
```

This swaps `docker compose exec -T postgres` for `docker exec -i <name>` and
changes nothing else: the commands still run *inside* the container, still
read `$POSTGRES_USER`/`$POSTGRES_DB` from its own environment, and still need
no password. Same convention as `db:dump-schema -- --container=<name>`.

One difference in `db:restore`: its automatic migrate-forward step normally
runs the `migrate` compose service, which doesn't exist outside the compose
project. Under a container override it runs the same entrypoint that service
runs (`scripts/migrate.ts`, i.e. `npm run db:migrate`) as a host process
against `DATABASE_URL` — so point `DATABASE_URL` at the database you just
restored into.

### Windows PowerShell: use `npx tsx` directly, not `npm run ... --`

`npm run <script> -- --flag=value` does not reliably forward flags to the
script when invoked from PowerShell — npm emits `npm warn Unknown cli config
"--flag"` and the flag never reaches the script's `argv`, so it fails with
that script's own usage error instead. This is a pre-existing npm/PowerShell
interaction issue (reproduces identically on the older `db:dump-schema`
script, unrelated to backup/restore specifically), not fixed by quoting the
whole flag. It does *not* happen in bash.

The reliable form on PowerShell is to bypass `npm run` and invoke `tsx`
directly via `npx`:

```powershell
npx tsx scripts/backup.ts --out=.\backups\owlgraph-2026-07-30.dump
npx tsx scripts/restore.ts --file=.\backups\owlgraph-2026-07-30.dump --yes
npx tsx scripts/restore-test.ts --file=.\backups\owlgraph-2026-07-30.dump
```

This works identically in bash too — use it there as well if in doubt. The
`npm run db:backup -- --out=<path>` form below is the primary documented
form (matches this repo's other scripts) and works fine on bash/macOS/Linux.

## Why no password is ever needed

All three scripts run `docker compose exec -T postgres ...` — they operate
*inside* the postgres container, never over a TCP connection (the `postgres`
compose service has no published port at all). Local
(unix-socket) connections inside the container trust any role by default, so
the scripts reference `$POSTGRES_USER`/`$POSTGRES_DB` — already present in
the container's own environment, from `docker-compose.yml`'s `environment:`
block — and never read or pass `POSTGRES_PASSWORD`. Requires only Docker
Compose; no local `pg_dump`/`pg_restore` install, and no version-skew risk,
since the client tools run inside the same container as the server (always
an exact version match).

## Backup

```bash
npm run db:backup -- --out=<path>
```

Writes a full custom-format dump to `<path>` (refuses to overwrite an
existing file unless you pass `--force`). It dumps the container's own
database (`POSTGRES_DB` inside it) unless `--db=<name>` names another — the
backup test dumps a database of its own that way. Example:

```bash
npm run db:backup -- --out=./backups/owlgraph-2026-07-30.dump
```

## Restore

```bash
npm run db:restore -- --file=<path> --yes
```

**Destructive** — overwrites the target database's current contents
(`pg_restore --clean --if-exists`). Requires `--yes`; without it, the script
prints what it *would* do and refuses. The script:

1. Reads the dump's `schema_migrations` rows directly from the archive
   (no live DB connection needed) and refuses if any version isn't present
   in this checkout's `migrations/` — the newer-into-older guard — or if the
   dump is from before the baseline and has applied only some of the
   migrations it replaces ([migrations.md](../architecture/migrations.md#the-baseline)). A
   dump that has applied all of them restores, and the migrate after it
   records the baseline in their place.
2. Restores into the target database (`POSTGRES_DB` by default; override
   with `--db=<name>`, used by the restore test below to target a scratch
   database instead of the real one).
3. When the target is the real database, automatically runs the `migrate`
   compose service (`docker compose run --rm --no-deps migrate`) to carry
   the restored state forward to the current app version — this is what
   makes restore-then-startup effectively "restore-then-migrate." `--no-deps`
   is load-bearing: without it, `docker compose run` first reconciles
   `postgres` (as `migrate`'s dependency) against the *current* host env,
   and will recreate it if that env differs at all from what's actually
   running — confirmed live during development, where a slightly stale host
   `.env` caused an already-healthy `postgres` container to be recreated
   mid-restore. `--no-deps` runs only the `migrate` container, against
   `postgres` as it already is. Skipped (with a printed note) for `--db`
   overrides, since `migrate`'s own `DATABASE_URL` always targets the real
   `POSTGRES_DB`.

A backup restored where a plugin it used isn't installed — or one made by a
newer build with block kinds this one doesn't have — restores those blocks
as they were (what a newer build added to a kind this one has is lost at
that block's next save): they are unknown blocks here
([blocks/anatomy.md](../architecture/blocks/anatomy.md#unknown-blocks)), shown to editors and agents, shown
to no reader, and kept by every save until someone deletes one on purpose.
Install the plugin (or the newer build) and they are back.

### Restoring a backup from before the baseline

A baseline ([migrations.md](../architecture/migrations.md#the-baseline)) stands in for the
migrations it replaces only on a database that has applied all of them.

- **A dump that has applied every one of them** restores like any other
  (`npm run db:restore -- --file=<path> --yes`), and the migrate after it
  records the baseline in their place.
- **One that has applied only some of them** is refused before anything is
  changed. Restore it with the release the baseline's header names in
  `upgrade-through:`, whose migrate applies the rest; then migrate with this
  release, which records the baseline in their place:

  ```bash
  git worktree add ../<checkout-of-the-tag> <tag> && cd ../<checkout-of-the-tag> && npm ci
  npx tsx scripts/restore.ts --file=<old.dump> --yes      # restores, and its migrate applies the rest
  cd <this-checkout> && npm run db:migrate                # records the baseline in their place
  ```

  Locally, add `--container=<container>` to the restore. On a server the
  worktree is a checkout: check out the tag, `docker compose up -d --build`,
  restore; then check out the current release and
  `docker compose up -d --build` again.

The individual migrations and the tag live only in the repository the squash
was made in, so keep it as long as such backups are kept.

## Restore test — run this, don't just trust the backup

An untested backup isn't a backup. The supported flow is to back up and
immediately test that exact artifact:

```bash
npm run db:backup -- --out=./backups/test.dump
npm run db:restore-test -- --file=./backups/test.dump
```

`db:restore-test`:

1. Creates a throwaway database (`restore_test_scratch`), dropping it first
   if it happens to already exist. With `--db=<name>` — the database the
   backup was taken of, as `db:backup -- --db=` names it — it compares
   against that one instead of `POSTGRES_DB`, in a scratch database named
   after it (`<name>_rt`). Postgres keeps only the first 63 bytes of a name,
   so a longer one would reach another database (`<name>_rt` cut short can be
   `<name>` itself): a `--db` name, here as for `db:backup` and
   `db:restore`, and the scratch name made from it are refused past 63 bytes
   before anything runs.
2. Restores the given file into it.
3. Verifies: the dump isn't newer than this checkout's migrations, nor from
   before the baseline with only some of the migrations it replaces; the
   schema came back (table count); `schema_migrations` has rows; the
   `pgcrypto` extension is present (and `vector`, once any migration
   actually adopts it); the generated full-text-search columns
   (`pages.search_tsv`, `documents.search_tsv`, `collections.search_tsv`)
   compute; collections and their `contains` edges come back the same, and so
   do an integration's sealed credentials and people's connections
   (`user_connections`) — the same ciphertexts, compared by a hash computed in
   both databases, still sealed; and, if the source
   database has at least one uploaded document, that document's bytes round-trip
   exactly (compared via a fresh SHA-256 of `documents.bytes`, computed
   independently in both the live and restored database — not by trusting
   the app-computed `documents.sha256` column).
4. Always drops the scratch database afterward, whether checks passed or
   failed.
5. Exits non-zero if any check failed.

Testing an **older, already-archived** backup file this way is still useful
(it proves the archive is readable and restorable), but the live-vs-restored
comparisons (row presence, byte round-trip) may show expected drift if the
live database has changed since that backup was taken — that's not a
failure of the backup, just time passing. Only treat a failure as a real
problem when testing a backup taken moments earlier, per the flow above.

## Recovering a real environment

```bash
npm run db:restore -- --file=<path> --yes
```

That's it — restore, migrate-forward, and the app is ready. If the `app`/`mcp`
containers were left running through the restore, no restart is required
(they'll simply start seeing the restored data on their next query); restart
them if you want a clean reconnect.

## Restore a backup locally

A server's backup restored into the local development database, so that
`npm run dev` serves the server's state — to reproduce a problem, or to keep a
copy of a site ready to show. The local database is usually a standalone
container (`<container>` below, its name), so every command names it with
`--container=`, and the migrate-forward step runs `scripts/migrate.ts` against
`.env`'s `DATABASE_URL`, which must name the same database
([Targeting a Postgres container outside this compose project](#targeting-a-postgres-container-outside-this-compose-project)).
Nothing here touches the server: the dump is a file copied from it.

**1. Check the dump.** A custom-format dump starts with `PGDMP` (restored
with `pg_restore`, which is what the script does); a plain SQL dump starts
with `--` and would need `psql -f` instead. The container's `pg_restore` must
be of the dump's Postgres major version or newer:

```bash
head -c 5 ./backups/<server-dump>.dump
docker exec -i <container> pg_restore -l < ./backups/<server-dump>.dump | head -12
docker exec <container> pg_restore --version
```

The listing's header names the format and the version it was dumped from. A
dump holding a migration this checkout doesn't have is refused by the restore
itself, before anything is changed.

**2. Back up the local database**, so the restore can be undone:

```bash
npx tsx scripts/backup.ts --out=./backups/owlgraph-local-<date>-before-restore.dump --container=<container>
```

**3. Restore.** Stop `npm run dev` first and leave the container running:

```bash
npx tsx scripts/restore.ts --file=./backups/<server-dump>.dump --container=<container> --yes
```

It restores over the local database (`--clean --if-exists --no-owner
--no-privileges`), then migrates forward: it prints `Applied: <versions>` for
the migrations the checkout has and the dump didn't, or `Already up to date.`

**4. Start `npm run dev` and look at the site**, signed in and as a reader in
a fresh private window. What to expect:

- **The server's accounts replace the local ones.** `users` comes with the
  dump, so sign in with the server's email and password.
- **Images, the logo, fonts, avatars and documents come with the dump** — all
  of them live in Postgres ([media.md](../architecture/media.md)), so no files are copied
  separately. The WebP copies are made again the first time a page asks for
  them.
- **The server's share links work locally** with the host swapped for
  `localhost` — but only their hashes are stored, so a link whose URL nobody
  kept can't be recovered. A new one made locally works as usual.
- **The dump's grants to `app_user` are skipped** (`--no-privileges`); the dev
  server connects as the superuser named in `DATABASE_URL` and doesn't need
  them.

To go back, restore the file from step 2 the same way.
