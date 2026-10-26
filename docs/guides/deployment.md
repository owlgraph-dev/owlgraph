# Deployment with Docker Compose

A self-contained Docker Compose stack that runs owlgraph on one host:
Postgres → migrate (one-shot) → app + MCP, tied to no external
infrastructure. Locally it runs as it is; on a server it runs behind a
TLS-terminating reverse proxy with the production override
([Production](#production)).

## Prerequisites

Docker and Docker Compose v2 (`docker compose`, not the standalone
`docker-compose` v1 binary), with at least 6 GB of memory for its builds: the
image's build stage runs the app's production build with a 4 GB Node heap,
which the client bundle needs (Docker Desktop: Settings → Resources).

## Project and container names

`docker-compose.yml` sets `name: owlgraph` explicitly. Compose otherwise
derives the project name from the checkout's directory name, and that name
prefixes the named volume (`owlgraph_pgdata`). Since the volume *is* the
database's identity, an implicit project name would mean renaming or cloning
the directory silently brings the stack up against a different, empty volume.
Pinning it makes the data independent of what the folder is called.

The containers are named explicitly too — `owlgraph-postgres`,
`owlgraph-migrate`, `owlgraph-app`, `owlgraph-mcp` — instead of carrying
compose's positional `-1` suffix. A reverse proxy sharing a network with this
stack addresses the app *by container name*, and so do `docker logs` and
`docker inspect` in a runbook; none of them should depend on a numbering
detail. Docker's embedded DNS resolves these names on any user-defined
network the container joins, so a proxy elsewhere on that network forwards to
`owlgraph-app:3000`.

The names are host-global, so two stacks from this file cannot run side by
side under different project names — which is what `CONTAINER_PREFIX` is for:

```bash
CONTAINER_PREFIX=owlgraph-verify docker compose -p owlgraph-verify up -d
```

Unset, it is `owlgraph`. (`container_name` also rules out `--scale`; this
stack runs one of each service by design.)

## First run

```bash
cp .env.example .env
```

Fill in **both** `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` — they ship empty
and the stack does not start without them. Use letters, digits and `- _ .`
only: both values are substituted into `postgres://` URLs, where `%`, `@`,
`:`, `/`, `?` and `#` already mean something (a `%` shows up as a
`URI malformed` error), and `$` is compose's own interpolation character.

```bash
docker compose up -d --build
```

`migrate` runs once, applies pending migrations, and exits `0` — check with
`docker compose ps` (it should show `Exited (0)`). `app` and `mcp` only start
once `migrate` has completed successfully; `migrate` itself only starts once
`postgres`'s healthcheck (`pg_isready`) passes.

The image runs with `NODE_ENV=production`, so `migrate` **refuses to run**
while `POSTGRES_PASSWORD` or `APP_DB_PASSWORD` is unset, a placeholder value
(`password`, `change-me`, …), or shorter than 16
characters — and with it, `app` and `mcp` never start. A stack with a
guessable database password never comes up. This holds for a local stack as
much as for a server: the rule lives in the image, not in the prod override.

**A later `POSTGRES_PASSWORD` change needs a volume reset.** Postgres binds the
superuser password when it *first initialises* its data directory and ignores
the variable afterwards, so changing it in `.env` leaves the database on the
old one and `migrate` stops with `auth_failed` / `password authentication
failed`. Either reset the database — `docker compose down -v`, which **deletes
the `owlgraph_pgdata` volume and all its content** — or change it in place:

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -c "alter role \"$POSTGRES_USER\" with password '<new>'"
```

`APP_DB_PASSWORD` has no such problem: `migrate` sets that role's password from
the current value on every run.

## `DATABASE_URL`: host-side scripts only

`.env`'s `DATABASE_URL` is the URL the **host-side** `npm run` scripts use
(`npm run dev`, `npm run db:migrate`, …) — host `localhost`, against a
Postgres port-mapped to the host. The compose services never read it: each
builds its own URL on the compose network (host `postgres`) from the
`POSTGRES_*` values — `migrate` as the superuser, `app` and `mcp` as
`app_user`. One `.env` therefore serves both workflows unchanged.

`app_user` reads and writes every table and uses every sequence, a later
migration's too (default privileges, the role block at the end of
`migrations/0001_baseline.sql`), and may create, alter or drop nothing in the
schema — on a database begun on Postgres 14 or earlier as well, whose
`public` schema once let everyone create.

Each process (the app, the agents' server, a script) holds one pool of
connections, 10 unless `DB_POOL_MAX` names another size; the integration
tests run with small ones ([testing.md](testing.md#integration-tests)).

Stopping the app (`docker compose stop`, `down` or `restart`) sends it
SIGTERM. It takes no new requests, lets the ones in flight finish, then ends
its pool and exits by itself, so it is normally gone at once. Docker kills a
container still running at the end of its grace period (ten seconds unless
`stop_grace_period` names another).

## Production

`docker-compose.prod.yml` layers the production settings over the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

On a server, start from `.env.production.example` instead of `.env.example`:
it sets `COMPOSE_FILE` so a plain `docker compose …` (including the
backup/restore scripts) always uses both files, and it lists only the values
a server needs.

What the override does:

- **Loopback-only ports.** `app` and `mcp` publish on `127.0.0.1` only. A
  TLS-terminating reverse proxy on the same host (nginx, Caddy) forwards the
  public domain to `127.0.0.1:${APP_PORT}` and the MCP path to
  `127.0.0.1:${MCP_PORT}/mcp`. Nothing is reachable around the proxy — so
  nobody can skip TLS, and nobody can forge the client-address header.
- **Required values.** `ORIGIN`, `POSTGRES_PASSWORD` and `APP_DB_PASSWORD`
  must be set; `docker compose` stops before starting anything otherwise.
  `ORIGIN` is the public `https://` origin: SvelteKit rejects form posts whose
  `Origin` header differs ("Cross-site POST form submissions are forbidden")
  and builds absolute URLs from it.
- **Client addresses.** `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`
  (one proxy hop) for the app, and the equivalent `trust proxy` setting for
  the MCP server. The rate limiters key on the client address; without this
  every visitor would share the proxy's address and one limit bucket. Raise
  `XFF_DEPTH` only if another proxy (a CDN) sits in front of yours.
- **Memory limits** per service.

**`APP_SECRET_KEY`** is optional: only an integration needs it, to seal its
credentials ([authorization.md](../architecture/authorization.md#secrets)). Set it once an
integration is used — 32 random bytes in base64
(`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
— and keep it with the backups' secrets, since no dump contains it
([backup.md](backup.md)). The app and MCP services get it and
`APP_SECRET_KEY_PREVIOUS` (for a rotation); `migrate` refuses a key that is set
but unfit. To rotate it, put the new key in `APP_SECRET_KEY` and the old one in
`APP_SECRET_KEY_PREVIOUS`, restart, re-seal what is stored —
`docker compose exec app npx tsx --tsconfig tsconfig.tsx.json scripts/rotate-secrets.ts`
(`npm run secrets:rotate` outside the container) — and drop the old key once
it reports nothing left under it. `INTEGRATIONS_ALLOW_HTTP_LOOPBACK` is test tooling and never belongs
in a server's `.env`.

**An integration's server** is not configuration: an administrator sets its
address under Settings → Integrations ([settings.md](../architecture/settings.md#the-integrations-group))
— a bare `https://` origin, the only place that integration's requests ever
go, never following a redirect off it
([authorization.md](../architecture/authorization.md#requests-to-other-services)). The app
container's outbound network must reach that origin; nothing else has to be
open, and a deployment that blocks egress elsewhere loses nothing.

A service that people connect their own accounts to sees every person's
requests come from this one server. Nextcloud's brute-force protection counts
refused logins per address and slows down — then blocks — the address that
collects too many, so one person's revoked app password must not cost
everyone: the Nextcloud administrator should add this server's address to
Nextcloud's brute-force allowlist (Settings → Administration → Security, or
the `bruteforcesettings` app). owlgraph keeps the limit Nextcloud then no
longer applies to it: a person may have a share's password checked only a
few times while it fails ([plugins.md](../architecture/plugins.md#routes)), so the allowlist
does not open a way to guess one through owlgraph. Nextcloud names a connection after this site's host
(`owlgraph (<host>)`, from `ORIGIN`), which is how a person finds it among
their devices and sessions there.

**Exposing the MCP server is a separate decision.** Its only guard is a bearer
token carrying its owner's full role, so publish it to the internet only
deliberately — through the same TLS proxy, ideally behind an IP allowlist.
Otherwise leave it on loopback and reach it through an SSH tunnel
(`ssh -L 3030:127.0.0.1:3030 <host>`), which needs no public route at all.

The proxy must forward `X-Forwarded-For` and `Host`, and allow request bodies
of at least `BODY_SIZE_LIMIT` (26 MB by default — documents go up to 25 MB;
nginx's `client_max_body_size` defaults to 1 MB). HSTS and the HTTP→HTTPS
redirect belong to the proxy too.

**It also needs room for the response headers.** SvelteKit emits a `Link:`
preload header listing the page's CSS and JS, which together with the CSP puts
a page response's header block around 5 KB — more than nginx's default
4 KB `proxy_buffer_size`, which answers such a response with `502 Bad Gateway`
and logs `upstream sent too big header`. For nginx (Nginx Proxy Manager: the
proxy host's *Advanced* tab):

```nginx
proxy_buffer_size 16k;
proxy_buffers 8 16k;
proxy_busy_buffers_size 32k;
```

## Request body limit

adapter-node rejects request bodies larger than `BODY_SIZE_LIMIT` (its own
default is 512 KB). The compose file sets it to `26M` (override via `.env`),
just above the largest upload the app accepts; the upload endpoints report a
body over the limit as `413` with the maximum size.

## Creating the first admin user

```bash
docker compose exec app npx tsx --tsconfig tsconfig.tsx.json scripts/create-admin.ts <email> ["Name"]
```

The password is prompted for twice, with echo off — never passed as an
argument, where it would land in shell history and the process list. Without
a terminal (`exec -T`, CI) it's read from stdin instead:
`printf '%s' "$ADMIN_PASSWORD" | docker compose exec -T app npx tsx … scripts/create-admin.ts <email>`.
Every account password — here and in Settings → Users — must be at least 12
characters and not an obvious one (`src/lib/features/auth/passwordPolicy.ts`).

One-off; safe to re-run (it errors clearly if the email already exists). No
env-var-driven bootstrap exists — this is intentionally the only way to seed
an admin, since it's run once per environment.

## What a fresh database already contains

Migrations seed everything the app needs to run, so a new instance is
complete the moment `migrate` exits `0`:

- one **default namespace** (no URL prefix), access level `internal`;
- the **`core` and `documents` property groups** and the document properties;
- the **node classes** `node`, `page`, `document`, `collection`;
- **nine paragraph styles** — one default per element (p, h1–h6) plus the
  Display and Label looks (`docs/architecture/typography.md`);
- **five page layouts** — Standard (protected), Two columns, Main and side
  column, Three columns, Sections
  ([blocks/layout.md](../architecture/blocks/layout.md#page-layout-sections)).

Everything else is genuinely empty and has a working empty state: no theme row
(the built-in defaults apply until Branding saves one), no typography tokens,
no navigation, no footer, no home page, no relationship types, no users beyond
the admin you create. Nothing needs a fixture or a manual `INSERT`, and
`db:backfill-search` is for existing data, never for a new instance.

## From an empty database to a public page

Right after the first admin exists, the site deliberately shows nothing to the
outside world. The steps, all in the app:

1. **Sign in** at `/login`. Without a home page, `/` shows the pages you can
   read; an anonymous visitor sees a neutral welcome.
2. **Decide the default namespace's access level** — Settings →
   Namespaces. It ships `internal`, so *nothing is public until you raise
   it*: a page cannot be more accessible than its namespace, and trying
   returns "A node cannot be made more accessible than its namespace". Raising
   the level also publishes every page and document that inherits it (anything
   without its own visibility), which is what the dialog's warning counts —
   see [authorization.md](../architecture/authorization.md#namespaces-access_level-is-a-live-default-overridable-per-node).
3. **Create a page** (the app bar's Create, or the home page's action) and
   set its visibility in the access panel if it should differ from the
   namespace.
4. **Set the home page** — Settings → Home page. `/` then redirects to
   it for everyone who may read it.
5. **Branding, navigation, footer** as needed.

A public site usually also needs a legal notice (Impressum) and a privacy
policy (Datenschutzerklärung): ordinary public pages, linked in Settings →
Footer. The app sets only
essential cookies (`session`, plus the locale and colour-scheme preferences),
so no consent banner is required for them.

## HTTPS required for login to persist

`src/routes/login/+page.server.ts` sets the session cookie with `secure:
!dev` — in a production build (`dev` is `false`) that means `Secure`, so
**browsers will not persist the session cookie over plain HTTP**. Logging in
over bare `http://<server-ip>:3000` appears to succeed but doesn't keep you
signed in. `http://localhost` is the exception: browsers treat it as a
secure context, so a local compose stack works without TLS. Anywhere else,
login needs the TLS proxy from "Production".

## Postgres image: pgvector, not currently used

`postgres` runs `pgvector/pgvector:pg16` — a drop-in superset of official
`postgres:16` with the pgvector extension available. No current migration
uses it (`migrations/0001_baseline.sql` only enables `pgcrypto`) — this is
future-proofing, chosen because switching Postgres images later isn't free.

## Ports

| Service    | Host port                | Notes                                   |
|------------|---------------------------|------------------------------------------|
| `app`      | `${APP_PORT:-3000}`       | The web UI / API; health at `/api/health` |
| `mcp`      | `${MCP_PORT:-3030}`       | Point the MCP Inspector at `/mcp` here; health at `/health` |
| `postgres` | *(none)*                  | Never published — internal network only  |

Inside the containers the ports are fixed (`app` 3000, `mcp` 3030);
`APP_PORT`/`MCP_PORT` only choose the host side. The production override
binds both to `127.0.0.1`.

## Logs / troubleshooting

```bash
docker compose logs -f app
docker compose logs -f mcp
docker compose logs -f migrate
```

Every service rotates its container log (`json-file`, 5 × 10 MB).

What the app actually writes to those logs — the event catalogue, the levels and
fields, what is deliberately never logged, and the audit subset — is
[logging.md](../architecture/logging.md). Retention is bounded by this rotation, by volume
rather than by time: there is no deletion job.

A failed `migrate` container is the most likely first-run issue — check for
a refused secret (see "First run"), a checksum-mismatch error (an applied
migration file was edited — see `docs/architecture/migrations.md`) or a connection-refused
error (started before `postgres` was actually ready — shouldn't happen given
the `service_healthy` condition, but worth checking if it does).

Behind the proxy, the usual failures are: every form post answering 403
"Cross-site POST form submissions are forbidden" (`ORIGIN` doesn't match the
public origin exactly — scheme, host, port); uploads failing with 413 at the
proxy (its body limit is below `BODY_SIZE_LIMIT`); and login being
rate-limited for everyone at once (`ADDRESS_HEADER`/`XFF_DEPTH` don't match
what the proxy sends).

## Source code for network users

owlgraph is licensed under the GNU AGPL 3.0 ([`LICENSE`](../../LICENSE), with the
[plugin exception](../../PLUGIN-EXCEPTION.md)). Section 13 of the AGPL asks
whoever lets people use a **modified** owlgraph over a network to offer them
the source code of the version they use. The app does the offering for you,
on its About page, `/-/about`:

- **How people get there.** The footer's legal line always ends with an info
  icon ("About this software") that opens it. That is the footer on every
  reading page, the home page, search, the sign-in page and the error pages.
  A site with no footer configured gets a minimal one that holds the icon
  alone. The icon is not footer data, so no footer setting removes it (the
  footer editor shows it as fixed). Admins also find the page in the settings
  (General → About).
- **Where the footer isn't shown.** The editor, the settings, the graph view
  and the design-system playground bring their own full-screen chrome and
  show no footer; everyone who uses them reaches the icon on every other
  page.
- **What the page shows:**
  - which owlgraph the site runs, its version and the revision it was built
    from;
  - the licence's notices (free software, no warranty);
  - links to the **source code of this version**, the **licence** (`/-/license`:
    `LICENSE` followed by the plugin exception, as text) and the
    **third-party licences** (`/licenses.txt`);
  - the footer's branding title above the heading, when one is set. The
    operator's own lines (imprint, privacy, contact) are in the footer below
    it, as on every page;
  - for administrators only, how the installation runs: versions, address,
    languages, integrations, and whether the database schema is behind and
    the secret key is set ([settings.md](../architecture/settings.md#the-general-group)).
- **Version and revision are public by design.** They are what "the source of
  the version you use" means. Every page's head links the licence
  (`<link rel="license">`) and names the generator, without a version.
- **Search engines.** The page asks them not to index it: a `noindex` robots
  meta tag and an `X-Robots-Tag: noindex` header. It is deliberately not
  disallowed in `robots.txt`, since a crawler that may not fetch the page never
  sees that it is not to be indexed.

The MCP server names the same address in its server information.

What you set is where the source link points:

| Variable | Default | What it is |
|---|---|---|
| `SOURCE_URL` | `https://github.com/owlgraph-dev/owlgraph` | The repository the running code comes from (http or https). |
| `SOURCE_REVISION` | `dev` | The commit or tag the build was made from, named on the About page. |

With a revision, the link opens the repository's tree at that revision
(`<SOURCE_URL>/tree/<revision>`, the path GitHub, GitLab, Gitea and Forgejo
serve), so `SOURCE_URL` should be a repository on such a forge. A `dev` build
links the repository itself.

Both are build arguments of the image, baked into its environment. With
compose, set them in `.env` and rebuild — the compose file hands them to the
build (`x-build`); empty means the defaults above:

```bash
SOURCE_REVISION=$(git rev-parse HEAD) docker compose up -d --build
# or, building the image yourself:
docker build --build-arg SOURCE_REVISION=$(git rev-parse HEAD) .
```

A `SOURCE_URL` or `SOURCE_REVISION` in a container's own environment
(`docker run -e …`) wins over the build argument.

An unmodified owlgraph needs only the revision. If you change the code,
publish your version and set `SOURCE_URL` to it — the default names the
upstream project, which is not the source of your changes. The image's
labels (`org.opencontainers.image.source`, `.revision`, `.licenses`) carry the
same values, and the image contains `LICENSE`, `PLUGIN-EXCEPTION.md` and
`THIRD-PARTY-NOTICES.md` beside the app.

## Rebuilding after code changes

```bash
docker compose up -d --build
```

`migrate` applies whatever is pending before `app` and `mcp` start, so the
rebuild is the whole upgrade. The exception is an installation from before
the baseline that hasn't applied every migration the baseline replaces:
`migrate` refuses it, changing nothing, and exits non-zero, so the app doesn't
start. It upgrades in two hops
([Across the baseline](upgrading.md#across-the-baseline)).

`app`, `mcp` and `migrate` build from the same `Dockerfile` (the shared
`x-build` settings), differentiated only by `command:`; Compose builds an
image for each, the later ones from the first one's cached layers.

The image has two stages: a build stage with the full dependency tree that
produces the adapter-node output, and a runtime stage that installs
production dependencies only (`npm ci --omit=dev --ignore-scripts`). The
runtime install skips dependency install scripts on purpose: the production
tree still pulls in vite through an optional peer chain (`bits-ui` → `runed`
→ `@sveltejs/kit` → `vite`), and vite's nested esbuild copy cannot complete
its postinstall there; no production dependency needs one (esbuild's only
optimizes its command-line shim — tsx uses the API, which resolves the
platform package itself). sharp, which reads and writes images
([media.md](../architecture/media.md)), ships libvips prebuilt per platform as optional
packages (`@img/sharp-linux-x64` for this Debian image, glibc), so it installs
without a script or build tools too.
