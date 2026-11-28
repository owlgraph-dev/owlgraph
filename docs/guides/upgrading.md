# Upgrading

How to bring an installation to a newer release, what the upgrade does to the
database, and how to go back if it goes wrong. Running a new installation is
[deployment.md](deployment.md).

## Before you upgrade

- **Back up the database, and prove the backup restores**
  ([backup.md](backup.md): `npm run db:backup`, then the restore test). An
  upgrade cannot be undone any other way: migrations only go forward
  ([decision 0001](../adr/0001-migrations-are-immutable-and-forward-only.md)).
  The scripts run from a checkout, an installation from a published image's
  too ([backup.md](backup.md#where-to-run-this)).
- **Know where you are.** The About page (`/-/about`) names the running
  release; an admin's view of it (General → About) also shows how many
  migrations the database has applied, the latest of them, and whether any
  are waiting.
- **Keep `APP_SECRET_KEY`.** Credentials are sealed under it, and only it opens
  them; changing it is a rotation of its own
  ([deployment.md](deployment.md#production)).
- **Close every editor first.** An upgrade can rename what a page stores, such
  as the fields a query block filters on. An editor left open across it saves
  the page as it held it, with the old names, and a query block saved that way
  shows its error until its query is set again.

## With Docker Compose

An installation built from a checkout upgrades by rebuilding, one that runs a
published image by pulling a newer one. In both, the `migrate` service runs
before `app` and `mcp` start, applies every migration the database has not
applied yet, and checks the checksum of every one it already has. If it
refuses, it changes nothing and exits non-zero, and the app does not start:
`docker compose logs migrate` says why. Then check the result: the About page
shows the new release, and nothing waiting to be applied.

### From a checkout

1. Check out the release you are upgrading to.
2. Rebuild and restart:

   ```bash
   docker compose up -d --build
   ```

### From a published image

An installation that runs a published image
([deployment.md](deployment.md#running-a-published-image)) upgrades to a newer
image:

1. Take the new release's compose files from its tag, as when installing, and
   keep `.env`: the stack the image expects belongs to the release too.
2. Name the new version in `.env`'s `OWLGRAPH_IMAGE`. An installation that
   names `X.Y` keeps it, and gets that version's latest patch release.
3. Pull it and restart:

   ```bash
   docker compose pull
   docker compose up -d
   ```

## Without Docker

The same steps by hand: stop the app, migrate its database with the new
release (`npm run db:migrate`, against the app's `DATABASE_URL`), then start
the new build.

## Across the baseline

At a milestone the migrations are squashed into one baseline
([decision 0016](../adr/0016-migrations-squash-into-a-baseline-at-a-milestone.md)),
whose header names the release tagged before the squash
(`-- upgrade-through:`). A database that has applied every migration the
baseline replaces is adopted on its next migrate, with nothing run. One that
has applied only some of them is refused, changing nothing, and the message
names that tag. It upgrades in two hops, with a backup before each and the
app stopped:

1. **Through the tagged release.** Check out the release the message names,
   and migrate. It applies the rest of the replaced migrations, checking every
   recorded checksum on the way.
2. **To this release.** Check out this release, and migrate again. It records
   the baseline in their place.

With a published image, each hop is that release's image: name its version in
`OWLGRAPH_IMAGE`, pull and start, and `migrate` runs with it.

A backup from before the baseline restores the same way
([backup.md](backup.md#restoring-a-backup-from-before-the-baseline)). Keep a
clone that has the tag for as long as such a database or backup exists: it is,
with that release's image, the only place the individual migrations live.

## Search text

A page's, a document's or a collection's search text is computed in
TypeScript when it is saved, not by a migration. A release that changes how
it is extracted says so, and so does removing a plugin
([Removing a plugin](writing-a-plugin.md#removing-a-plugin)): then
`npm run db:backfill-search` recomputes it for everything, from a checkout
against the database's `DATABASE_URL`
([deployment.md](deployment.md#database_url-host-side-scripts-only)). It is
safe to run again; `-- --suggest-locales` also suggests each upload's
language again, which brings back dismissed suggestions.

## Going back

There are no down-migrations. To go back, stop the app, restore the backup you
took before the upgrade (`npm run db:restore`, [backup.md](backup.md#restore)),
and start the release you came from: its checkout, or its image named in
`OWLGRAPH_IMAGE` again.
