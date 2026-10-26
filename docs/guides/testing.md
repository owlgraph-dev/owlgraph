# Testing

How owlgraph is tested: the kinds of test there are, which one a behaviour
belongs in, how to run them, and the rules each kind follows. One idea runs
through all of it: **test a behaviour once, at the lowest layer that can
observe it.**

## Layers

> Decision: [0015. Each behaviour is tested at the lowest layer that can observe it](../adr/0015-each-behaviour-is-tested-at-the-lowest-layer.md).

The tests form the classic pyramid. The bottom holds many small, fast tests
of plain logic. The middle holds fewer tests that need a database, a running
handler or a browser for one component. The top is a thin layer of tests that
drive the whole app in a real browser.

```
              ┌───────────────────┐
              │    End to end     │  Playwright: a browser on the production build
          ┌───┴───────────────────┴───┐
          │        Integration        │  Postgres · the built handler · one component in Chromium
      ┌───┴───────────────────────────┴───┐
      │               Unit                │  plain logic, no I/O
      └───────────────────────────────────┘
```

Each step up costs more: a test there is slower, needs more of the system
running, and says less precisely what broke when it fails. So a behaviour
goes as low as it can be observed, and a higher layer is used only for what
a lower one cannot see.

Integration has three kinds, so there are five kinds in all. A file's suffix
says which kind it is:

| Tier | Kind | File | Runs in | Observes |
|---|---|---|---|---|
| Unit | Unit | `*.test.ts` | Vitest, Node; no database, network or browser | pure logic, called with plain values |
| Integration | Database | `*.int.test.ts` | Vitest, Node, a real Postgres | a feature's server functions and route adapters, the MCP tools in-process, SQL filters, who may read and write what |
| | HTTP | `*.http.test.ts` | Vitest, the production build's handler, `fetch` | what a request gets back: status, headers, redirects, cookies, the content security policy, API answers |
| | Component | `*.svelte.test.ts` | Vitest's browser mode, Chromium | one Svelte component or route page, with its data mocked |
| End to end | E2E | `e2e/*.spec.ts` | Playwright, the production build | what only a browser running the whole app shows: the editor, hydration, the strict policy in the browser, phone layouts, editor/page parity, journeys across pages and roles |

The first four run on Vitest, one project per kind (`vitest.config.ts`); the
database and HTTP kinds share the `integration` project. End-to-end specs are
Playwright's (`playwright.config.ts`).

Every file sits beside the module it covers: `render.test.ts` next to
`render.server.ts`, a component's test next to the component, a feature's
specs in its `e2e/` folder. The shared harness lives in `tests/`
([Where specs live](#where-specs-live)).

## Choosing a layer

Take the first layer that can observe the behaviour:

1. **Unit:** the logic can be called with plain values.
2. **Database:** it needs the database: a query's filter, who may read what,
   a save's guard, a tool's answer.
3. **HTTP:** it is what a request gets back (a status, a header, a redirect,
   a body) rather than what a function returns.
4. **Component:** it is how one component behaves in a browser: what it
   shows, what a click or a key does, what it calls back.
5. **E2E:** only a browser running the whole app shows it.

Examples from the suite:

| Behaviour | Layer | Test |
|---|---|---|
| A sign-in's redirect stays on this site, however another host is spelled | unit | `features/auth/safeRedirect.test.ts` |
| A document new in an internal namespace inherits its level, so an anonymous reader may not read it | database | `features/namespaces/access.int.test.ts` |
| The session cookie is HttpOnly, SameSite=Lax and Secure, and a signed-in viewer's pages are never stored | HTTP | `features/auth/signIn.http.test.ts` |
| The access panel makes a share link, shows its address once, and revokes it after a confirmation | component | `features/nodes/components/AccessControlPanel.svelte.test.ts` |
| An admin takes over a page another editor holds, that editor's unsaved work is kept as a draft, and its picks land on the page | E2E | `tests/e2e/journeys/two-editors.spec.ts` |

A test asserts what can be seen at its layer: "an anonymous request gets a
404 and no body", not the return value of the function behind it.

## Rules for every test

- **One behaviour per test, named after what it observes:** `'signing out
  ends the session on the server: the old cookie is anonymous afterwards'`.
  A failure then reads as the behaviour that broke.
- **A known bug is pinned, not skipped.** Write the test that states the
  intended behaviour and mark it `it.fails(…)` (Vitest) or `test.fail()`
  (Playwright), with a comment saying what happens today. The run stays green
  while the bug lasts and turns red the moment it is fixed, so the marker
  goes with the fix.
- **When behaviour changes on purpose, update the test** and name the change
  in the commit. When it changed by accident, fix the app. A weakened
  assertion is worse than a red one.
- **A flaky test is a bug** in the test or the app. Reproduce it alone with
  `--repeat-each=3` (Playwright) or by running its file again, find the race,
  and fix it. Nothing is retried: Playwright's `retries` is `0` by design.

## Running tests

**The gate, `npm run gate`, is the definition of done.** It runs the build,
`npm run check`, the unit tests, the integration tests (database and HTTP),
the component tests and every e2e lane, in that order, and stops at the first
step that fails. Green means every step passed. CI runs the same steps in
parallel jobs ([CI contract](#ci-contract)).

`npm run check` is the static half: svelte-check with warnings as errors, the
architecture boundaries (`scripts/check-boundaries.mjs`), the UI conventions
(`check-ui.mjs`), no stray `console` (`check-console.mjs`), the repository
paths the docs and code comments name (`check-paths.mjs`), and the licence
header on every source file (`license-headers.mjs --check`).

| Command | What it does |
|---|---|
| `npm run gate` | build → `npm run check` → unit → integration → component → every e2e lane |
| `npm test` | unit tests (no database) |
| `npm run test:int` | database and HTTP tests (a Postgres; HTTP tests need a current build) |
| `npm run test:component` | component tests in Chromium |
| `npm run test:e2e` | builds once, then every e2e lane against that build |
| `node scripts/e2e.mjs app` | one lane (`app` or `branded`); add `--skip-build` to reuse the build |
| `npx vitest run <file>` | one Vitest file, whatever its kind |
| `npx playwright test <spec>` | one spec: builds, then runs it |
| `E2E_SERVER=built npx playwright test <spec>` | one spec against the existing build: no rebuild |
| `E2E_SERVER=dev npx playwright test <spec>` | one spec against `vite dev`, for changing app code between runs ([Servers](#servers)) |
| `npx playwright test <spec> -g "<title>"` | one test by name |

While working on a feature, run its own files: `npx vitest run <file>` and
`npx playwright test <spec>`.

In PowerShell, set the variable first: `$env:E2E_SERVER = 'built'`. Write a
project as `--project=app`, with `=`: Playwright reads the values after a
bare `--project` as more project names, including any spec paths that follow.

## The test databases

Every run works on databases of its own, all derived from the one
`DATABASE_URL` names. By default that is
`postgres://user:password@localhost:5432/owlgraph_test`, and `.env` is never
consulted for it. The database's name must contain `test`
(`tests/e2e/testDb.ts`), and nothing creates or drops a database whose name is
not derived from it (`tests/support/databases.ts`):

| Database | What it is |
|---|---|
| `<base>_int_tpl` | the integration run's template: migrated and seeded once per run |
| `<base>_int_c<pid>_<id>` | one integration test file's clone of it, dropped when the file is done |
| `<base>_int_c<pid>_<id>_<suffix>` | a database a file makes beside its clone (an empty migration target, a restore's scratch), the file's own like its clone |
| `<base>_e2e_tpl` | the e2e run's template |
| `<base>_e2e_w<n>` | e2e worker `n`'s clone of it, kept after the run for inspecting a failure |
| `<base>` | dev mode's one database, which every worker shares |

- **One seed, two consumers.** `tests/support/seed.ts` empties a migrated
  database back to what the suite starts from and seeds what the tests rely
  on: five users (admin, editorA, editorB, editorC, viewer); a public, an
  internal and a restricted page (owned by editorA, shared with editorB);
  documents and images of each visibility; a page with a query block; a page
  of references and typed edges; the core classes, paragraph styles and page
  layouts; a session and an API token per role. Its ids, slugs, sessions and
  tokens are new every time.
- **Clones are copies.** `CREATE DATABASE … TEMPLATE` copies the template's
  files, so every clone carries the same rows: the same ids, sessions and
  tokens. That is what lets every e2e worker share one `.seed.json` and one
  set of `.auth/` files, and every integration file one seed record. A
  template must have no open connection while it is cloned, so the seed
  closes its pool first.
- **The sweep.** A run begins by dropping the clones a crashed run left
  behind, but only those no session uses, so a run in progress elsewhere on
  the same server is left alone.
- **One run of each kind per base at a time.** The templates and the e2e
  workers' databases have fixed names, so a second integration or e2e run on
  the same base recreates the ones the first is still using. A second run at
  once needs a base of its own: another `DATABASE_URL`.
- **The role** must be allowed to create databases and roles (CREATEDB,
  CREATEROLE: a superuser, as the Postgres image's user is), and `pgcrypto`
  must be available.

To seed a database without a run (for a script that drives the app on its
own), seed the base database as dev mode does:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/owlgraph_test npx tsx --tsconfig tsconfig.tsx.json --import ./scripts/lib/register-svelte.mjs -e "const m = await import('./tests/e2e/global-setup.ts'); await m.default();"
```

The `--import` is needed because the seeding imports the page renderer, whose
module graph holds Svelte components; the MCP server runs with the same hook.

## Unit tests

A `*.test.ts` file (one without `.int`, `.http` or `.svelte` before the
suffix) runs in the Vitest project `unit`: in Node, with no database, no
network and no browser. It calls a module with plain values and asserts what
comes back. The harness's own helpers in `tests/` and the scripts in
`scripts/` have unit tests too (`scripts/**/*.test.ts`). A script's helper is
called with plain values; a check or a fixer runs as a child process on a
small fixture tree of the test's own, named with `--root`, as
`check-boundaries.mjs` and `license-headers.mjs` take it.

- **Nothing to connect to.** `DATABASE_URL` is set only so that modules which
  touch the database can be imported. A test that needs the database is a
  database test.
- **Svelte compiles for the server,** since the public renderer server-renders
  a block's component, so a render test needs no browser.
- **The logger is real but silent** (`LOG_LEVEL=silent`). A test that cares
  about a log line asserts on it.
- **A worker thread per file:** each file starts with a fresh module graph.

## Integration tests

### Database tests

A `*.int.test.ts` file calls the app's server modules against a real
Postgres, with no HTTP and no browser: a feature's functions, a route
adapter, or the MCP server through the SDK's in-memory transport
(`tests/integration/mcp.ts`: `connectAs(role)` is a client of the real server
for a seeded role's user). These files run in the Vitest project
`integration` (`vitest.config.ts`):

- **`tests/integration/global-setup.ts`** creates `<base>_int_tpl`, migrates
  and seeds it, and hands the seed to the tests: `inject('seed')` gives what
  `.seed.json` gives a spec.
- **`tests/integration/database.ts`** runs before every test file. It clones
  the template for that file and points `DATABASE_URL` at the clone before the
  file's imports run (`platform/db.server` binds the URL at import), then
  drops the clone when the file is done. What a file writes is its own, so a
  test may change site-wide state without a lock.
- **One worker thread per file, isolated,** four at a time. A file's database
  pool, environment and module-level state (caches, rate limiters) start
  fresh and are never shared. A file whose code loads PDF.js (extracting an
  uploaded PDF) must run in a child process instead, in a project of its own
  in `vitest.config.ts` with `pool: 'forks'`, since PDF.js's native canvas
  binding can crash a worker thread as it exits on Windows.
- **Hermetic:** a developer's `.env` is not read (`DOTENV_CONFIG_PATH`), the
  logger is silent, `APP_SECRET_KEY` is the run's own, and
  `MCP_DISABLE_LISTEN=1`.
- **Small pools:** `DB_POOL_MAX=4`. Four files at once each hold their own
  pool, an HTTP file holds a served build's beside it, and a script a test
  runs holds one more. At the default of 10 they would reach the server's
  connection limit (100).

**The operations scripts** (migrate, backup, restore, secret rotation, the
baseline generator) are
tested by running them as `npm run` does, in a process of their own
(`tests/integration/scripts.ts`, `runScript`), against the file's database
and with only the environment the test gives them. The backup, restore and
baseline scripts reach the server inside its container, because pg_dump and
pg_restore run there, never over TCP. `PG_CONTAINER` names that container,
the one whose port `DATABASE_URL` reaches
(`PG_CONTAINER=<container> npm run test:int`). Without it their tests are
skipped and the run says why; with `CI` set they fail instead
(`tests/integration/pg.ts`). The migration runner takes a directory
(`runMigrations(sql, dir)`), so its tests apply migrations of their own to an
empty database.

### HTTP tests

A `*.http.test.ts` file serves the production build's request handler
(`build/handler.js`) in-process on a port of its own, against its file's
cloned database, and drives it with `fetch` (`tests/integration/http.ts`,
`startApp()`). That is the app as it ships (hooks, sessions, headers, every
route) without a browser. These files run in the integration project:

- **A current build is required.** Without `build/handler.js`, or with one
  older than the sources it is built from, an HTTP file is skipped and the
  run says so once ("run npm run build"). With `CI` set, it fails instead.
  The gate builds first, so it always runs them. A deleted source file
  leaves no newer time behind, so rebuild after deleting one
  (`tests/integration/build.ts`).
- **The origin is `http://owlgraph.test`** (`ORIGIN` is read when the handler
  is imported). A form post sends it as its `Origin` header.
- **Fresh per file:** the handler's rate limiters and caches live in the
  file's own thread, so a test of a limit starts from an empty bucket, with
  no reset hook in the app.
- **Sessions** are made directly (`createSession` from the auth feature) on the
  file's database and sent as the `session` cookie.
- **The helpers** speak to the app as a browser would:
  - `call(app, path, { as, from, … })` makes one request, without following
    redirects, as a seeded role (`cookieFor(role)`, a session per role and
    file) or anonymously. It accepts HTML as a browser does, because fetch's
    own `*/*` would have SvelteKit answer a form post as an enhanced form's
    JSON.
  - `formAction(app, '/settings/users?/update', fields, { as })` posts as an
    enhanced form does, and reads the action's `data` back.
  - `createPage(app, role, fields)` makes a page of the test's own through
    the page API.
- **The client's address** is the request's `X-Forwarded-For`. The handler
  is imported with `ADDRESS_HEADER` set, as behind the deployment's proxy,
  and `call`'s `from` names the address. A test of a limit keyed by the
  address speaks from addresses of its own.

The agents' server is a process of its own, not part of the build. Its HTTP
tests (`src/mcp/mcp.http.test.ts`) serve its express app (`app`, exported by
`src/mcp/server.ts`) on a port of their own, from its sources, so they need
no build. Its limiters are keyed by the client's address, which behind a
proxy (`ADDRESS_HEADER`, set before the server is imported) is the request's
`X-Forwarded-For`, so each test speaks from addresses of its own.

### Component tests

A `*.svelte.test.ts` file renders one component in Chromium through Vitest's
browser mode (the `component` project) with `vitest-browser-svelte`, and
drives it with `@vitest/browser/context` (`page`, `userEvent`):

- **No SvelteKit.** `$app/state`, `$app/stores`, `$app/navigation`,
  `$app/environment` and `$app/forms` are stand-ins (`tests/component/app/`).
  `page` from `$app/state` is a plain reactive object the test fills before it
  renders, with the signed-in user in `page.data.user`. `$app/stores`' `page`
  and `navigating` are that same object as stores, so a component reading
  `$page` sees it too.
- **Navigation and forms are inert:** `goto` and `invalidateAll` do nothing
  and `use:enhance` leaves a form as it is. A test that asserts where a
  component goes spies on the stand-in (`vi.mock('$app/navigation', { spy:
  true })`). A test that submits an enhanced form mocks `$app/forms` with an
  `enhance` that catches the submit, records the action and its fields, and
  runs the page's callback with the answer the test gives. The settings
  catalogues' test (`src/routes/settings/schema/catalogs.svelte.test.ts`) is the
  pattern, replaying a reload by rendering again with the next load's data.
- **A route page** (`+page.svelte`) renders with the `data` its load returns,
  in a test file beside it named after the route (a `+` file name is
  SvelteKit's).
- **Data comes from a mocked `fetch`** (`vi.stubGlobal`) answering the
  requests the component makes. The test asserts what was asked, what the
  component shows and what it calls back.
- **The app's stylesheet** (`src/app.css`, its tokens and layers) is loaded
  before every file (`tests/component/setup.ts`), as the root layout loads it.
- **The window is a phone's** (414px wide) unless a test sets another
  (`page.viewport(1280, 800)`), so the shell draws its phone layout.
- **The browser** is the Chromium Playwright installs: `playwright` is pinned
  to `@playwright/test`'s version, so both use the same build.

The node picker's create row (`src/lib/features/search/picker/NodePickerPanel.svelte.test.ts`)
is the reference for a component; the settings catalogues' test is the
reference for a route page with forms.

## End-to-end tests

An end-to-end spec drives the whole app in Chromium, against a production
build on a database of its own. It is for what only a browser running the
app shows:
- the editor: contenteditable, selection, undo, drag;
- hydration;
- the strict style policy as the browser enforces it;
- phone layouts;
- the editor and the public page drawing a block alike;
- the journeys.

### Where specs live

Specs live with the feature they exercise:
- `src/lib/features/<feature>/e2e/*.spec.ts`;
- `src/lib/plugins/<id>/e2e/*.spec.ts` for a plugin;
- `src/lib/shell/e2e/` for the app shell;
- `src/lib/design-system/e2e/` for the design-system lane;
- `tests/e2e/journeys/` for the journeys ([Journeys](#journeys)).

`playwright.config.ts` finds them with
`testMatch: ['src/**/e2e/*.spec.ts', 'tests/e2e/journeys/*.spec.ts']`.

The shared harness stays in `tests/`. What every layer uses is in
`tests/support/` (`databases.ts`, the run's databases; `seed.ts`, the seed),
the integration and component projects' setup in `tests/integration/` and
`tests/component/`, and Playwright's in `tests/e2e/`. A test under `src/` imports
it as `$tests/…` (`$tests/e2e/fixtures`): the alias is `kit.alias` in
`svelte.config.js` (and so the generated tsconfig's paths, which Playwright
reads), `vitest.config.ts` and the Node loader hook. Only tests import it, a
spec's helpers in an `e2e/` folder included (`check-boundaries`):

| File | Role |
|---|---|
| `global-setup.ts` | seeds the run, makes the workers' databases, starts their servers and checks them |
| `servers.ts` | one production server per worker, its log in `.servers/` |
| `runDatabases.ts` | every database of the run, for a setup every worker must see (the branded accent) |
| `seed-data.ts` | the seeded ids, slugs and tokens; `authState(role)` |
| `fixtures.ts` | the `test` and `expect` every spec imports |
| `api.ts` | setup through the HTTP API: pages, documents, namespaces, classes, form actions, unique names |
| `doc.ts` | document builders for seeding a page's content |
| `editor.ts` | the editor's own selection |
| `probe-doc.ts` | a page with every block kind |
| `pdf.ts` | a real one-page PDF for seeding documents, which extracts like an upload |
| `testDb.ts` | which database a run may reset: one whose name contains `test` |
| branded-accent setup and teardown | the branded lane's accent |
| `.auth/`, `.seed.json`, `.servers/` | generated, disposable |

**Server code in a spec.** Some specs run server modules in the Playwright
worker: they seed or read the worker's database directly
(`platform/db.server`), call a feature's server functions, or build the real
MCP server for a seeded user and talk to it over the SDK's in-memory
transport. That code is not the server's process, so it shares nothing in
memory with it: not a cache the server keeps, not a rate limiter, not a
plugin's held listings. The worker's `APP_SECRET_KEY` is not the server's
either: it is the one `.env` gives it, and in CI, which has no `.env`, it has
none. Such a spec asserts what it wrote and what the
server answers, never the server's memory, and seals nothing for the server
to open.

These module graphs (the MCP server's, global-setup's, the fixtures') hold
the page renderer, and with it the Svelte components some blocks are drawn by
([blocks/anatomy.md](../architecture/blocks/anatomy.md#svelte-leaf-blocks)). `playwright.config.ts` registers
the loader hook that compiles them (`scripts/lib/svelte-hooks.mjs`, the one
the MCP server itself runs with) through Node's in-thread hooks API, after
Playwright's own TypeScript loader. So the hook is in place in the runner and
in every worker before anything else loads.

### Journeys

A journey is one end-to-end test of a golden path that a person walks across
pages and roles: signing in and out, writing and publishing a page, two
editors on one page, an agent writing a page that a reader then opens. Its
point is the flow, checking that pieces each tested at their own layer work
together at the points a person notices.

- **One test, in steps.** Each phase is a `test.step(…)`, and each person is
  a browser context of their own (`browser.newContext({ storageState:
  authState(role) })`, or an empty state for an anonymous visitor). Setup
  that the journey does not walk through itself is made through the API.
- **The harness's own.** Journeys cross every feature, so they belong to none
  and live in `tests/e2e/journeys/`. A journey through a plugin belongs to
  that plugin instead, in its `e2e/` folder as `journey-<name>.spec.ts`. The
  core never names a plugin ([plugins.md](../architecture/plugins.md)), so retiring the
  plugin takes its journeys with it.
- **Added beside narrow tests, never instead of them.** A test that states one
  behaviour precisely stays even when a journey walks through the same step.
  Its failure says which behaviour broke; a journey's failure says only which
  step.
- **Few.** A journey is a path people actually walk from start to finish, not
  a way to test a feature's details.

### Servers

`E2E_SERVER` chooses what the specs run against:

| Value | Servers | Use |
|---|---|---|
| unset (`build`) | builds the app, then one `node build` per worker | the default; what the gate runs |
| `built` | one `node build` per worker on the existing build, no rebuild | a spec changed, the app did not |
| `dev` | one `vite dev` on 5173, reused when one is already running, on one shared database | changing app code between runs |

A production build is the default because it is what ships. Under `vite dev`:
- the strict style policy does not exist;
- the code compiles on demand (an editor page is about a thousand module
  requests), so load turns into timeouts.

**A database and a server per worker.** In the build modes,
`tests/e2e/global-setup.ts` seeds the e2e template, clones it once per worker
(`<base>_e2e_w<n>`, [The test databases](#the-test-databases)) and starts a
production server on each clone, on port `4174 + n` (`tests/e2e/servers.ts`).
`playwright.config.ts`, which every worker evaluates before any spec loads,
gives worker `n` (its slot, `TEST_PARALLEL_INDEX`) that database, and that
server's address as `baseURL`. So no worker sees another's rows, and no
worker's requests reach another's rate limits or caches. A server's output
goes to `tests/e2e/.servers/w<n>.log`. The ports are fixed, so only one
Playwright run can go at a time on a machine. A run whose ports are already
taken stops before it builds, naming them; the usual cause is a server an
earlier run left behind (on Windows, a `node build` outlives the terminal
that started it). At the end of a run each server is sent SIGTERM, on which
it finishes its requests, ends its database pool and exits; one still running
five seconds later is killed.

Each build-mode server gets:
- `ENABLE_DESIGN_PLAYGROUND=true`, because the design-system a11y spec needs
  `/dev/design-system`;
- `BODY_SIZE_LIMIT=26M`, as the production compose file sets it.

Every server gets what an integration ([plugins.md](../architecture/plugins.md)) needs:
- an `APP_SECRET_KEY` to seal its credentials with, new each run since every
  run starts from the seed;
- `INTEGRATIONS_ALLOW_HTTP_LOOPBACK=1`, so a spec can point an integration at
  a stand-in it starts on `127.0.0.1` over plain http, which a deployment
  never allows ([authorization.md](../architecture/authorization.md#requests-to-other-services)).

A dev server you started yourself has neither unless you give it them.

**The dev loop.** Start the ordinary dev server against the test database and
leave it running:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/owlgraph_test npm run dev
E2E_SERVER=dev npx playwright test src/lib/features/content/e2e/page-sections.spec.ts
# change app code, run the spec again: no build
```

If no server is running, Playwright starts `npm run dev` with the test
database and stops it after the run. Dev mode is a convenience, not proof:
- the strict-CSP spec skips itself there;
- the gate always builds and refuses `E2E_SERVER=dev`;
- a spec that passes in dev mode can still fail against the build.

Two things to avoid while a dev-mode run is active:
- **Editing `src/`.** HMR re-evaluates server modules mid-run.
- **Editing a GraphQL adapter.** It re-registers its types, and every later
  request fails until the dev server restarts.

### Stand-ins for other services

A plugin's specs bring their own stand-in for the service it talks to, in the
plugin's `e2e/` folder: an in-process `node:http` server on port 0 that
answers the few calls the plugin makes, from data the test describes. The
Nextcloud plugin's `mockNextcloud.ts` serves:
- `status.php` and a public share's WebDAV;
- Login Flow v2, with an approval page a test clicks through as one of its
  users;
- the OCS calls that check and forget an app password;
- each user's own WebDAV tree, where a share received sits under the owner's
  file ids, and a user's `hidden` paths are what their permissions keep from
  them.

A test can revoke a share, change its password, move a file, revoke a user's
app passwords or take the whole server down (`mode`), and see what the plugin
makes of it. The stand-in records every request, with the user an app
password named, so a spec can assert what was sent and as whom. The plugin's
unit tests use the same stand-in with the real pinned client and a host of
their own (`e2e/fakeHost.ts`). A route under test is handed the answers it makes
(`respond`, with `jsonResponses` for its JSON and its 404); every part of the
host a test does not answer refuses.

A test that connects an account does it as a person of its own
(`throwawayUserState`, and `sessionStateFor` for a second session of theirs),
never as a seeded account, which every other test reads as it was. Every such
person's pages land in the public default namespace, where a document made
of a file is one per file, so a test that makes one names a file no other
spec uses. `realCheck.ts` beside the specs runs the same calls against a real
Nextcloud with a test account, by hand and never in a suite.

### The seed a run starts from

Every run starts from the same seed ([The test databases](#the-test-databases)).
`tests/e2e/global-setup.ts` writes from it:
- a session per role to `tests/e2e/.auth/<role>.json`, so specs start signed in;
- the seeded ids, slugs and API tokens to `tests/e2e/.seed.json`.

Every worker's database is a clone of the one seeded, so both files hold for
every worker. Global setup then checks every server by asking for an
authenticated page with the admin session it just created. Only a server
reading a clone of this seed knows that session, so a server on another
database, such as a dev server on the dev database, stops the run with a
message saying so. A server left running from an earlier run would pass that
check, since it reads a clone recreated under the same name, so it is caught
earlier: its port is taken, and the run stops before anything is built
([Servers](#servers)).

### Lanes

A run covers one lane:
- **`app`:** every spec.
- **`branded`** (`E2E_BRANDED_ACCENT=1`): the design-system checks a brand
  accent can break (axe, focus rings, state steps), run a second time under a
  seeded, extreme accent. The tests it runs carry the tag `@branded`
  (`playground.spec.ts`), and its setup writes the accent into every worker's
  database. The accent is site-wide for the whole lane, so the lane runs on
  its own.

`npm run test:e2e` runs both, one after the other, and reports both even when
the first fails. It checks the database server first and stops at once if it
cannot reach it. Without that check, a stopped database would show up only as
a server's health check timing out minutes later.

**Shards.** A lane splits across machines with Playwright's own sharding:
`node scripts/e2e.mjs app --skip-build -- --shard=1/2` runs the first half and
`--shard=2/2` the second, each on its own databases and servers. CI runs the
app lane in two shards.

### Isolation

In the build modes every worker has a database and a server of its own, and
a worker runs its tests one after another, so no two tests ever overlap on
the same state. In dev mode the workers share one database, so a test that
changes shared state must not overlap with the tests that would observe it.
A test declares that with an option of the `test` from
`tests/e2e/fixtures.ts`, per file or per describe block. The option costs
nothing in the build modes, where nothing contends for its lock:

- `test.use({ siteWide: true })`: the test changes how every page renders,
  for example the site theme, the capability defaults, the default content
  scheme, site stylesheets, text styles or the interface font. It runs alone.
  It holds an exclusive advisory lock that every other test holds shared, so
  it waits for the tests in flight and holds back the rest until it is done.
  That wait is the cost, so keep the option on the describe block that
  changes the state. A test that only reads site-wide state needs no option,
  since the shared lock it already holds keeps every writer out.
- `test.use({ lock: '<resource>' })`: the test changes one shared resource
  that a known set of other tests also changes or asserts on: the home page
  setting (`home`); the global logo (`logo`); the seeded pages, for a test
  that has to rewrite and restore them rather than use pages of its own
  (`seeded-pages`); or an integration's settings, which each test of it
  points at its own worker's stand-in (`integration-settings`). Tests naming
  the same resource run one at a time, and beside everything else. A new
  resource is a new name in the `Resource` type.

A test whose changes are rows of its own needs neither. A page, namespace,
class, font family or nav entry under a name no other test uses is invisible
to the rest of the suite. That holds only for tests that read just what they
assert on, so a test that lists nodes narrows the list to them (the seeded
pages' slugs and its own, say) rather than looking for them in the whole
list. A list query returns its first rows only, and other specs make
readable nodes of their own in parallel, which would push the ones it looks
for out of view.

The locks cover a test, its `beforeEach`/`afterEach` hooks and its test-scoped
fixtures, never `beforeAll`/`afterAll`. So a test that changes shared state:
- sets it up and restores it inside its own scope;
- restores it in `afterEach`, preferably straight through the database, so a
  test that fails halfway cannot leave it behind for the rest of the run.

### Writing specs

- **Import `test` and `expect` from `$tests/e2e/fixtures`,** never from
  `@playwright/test`. Types and `request` still come from `@playwright/test`.
- **Select by behaviour:** roles, accessible names, labels, `data-testid`.
  Never a `style` attribute, a generated class or the presence of inline
  styles. Public routes render no `style` attribute at all under the strict
  policy, so an assertion on one passes no matter what. Assert the computed
  value instead (`getComputedStyle`).
- **Wait for a condition, never for time:** `expect(...)` with its timeout,
  `expect.poll`, `page.waitForResponse` on the request that must complete, or
  the element's `getAnimations()` for a transition. Never `waitForTimeout`.
  Where the assertion is that something does *not* happen within a span (a
  paused toast outliving its timeout), install `page.clock` before loading the
  page and move time past the span with `page.clock.runFor()`.
- **Await a save before leaving the page.** Closing a page or context cancels
  its requests in flight, so a test that asserts on text already on screen
  and then closes the page can abort the very save it checked.
- **A form action is done once SvelteKit has applied it,** not at its
  response. An enhanced form then reloads the page's data and moves the focus
  to the page, so a field typed into meanwhile loses the focus, and what is
  typed next goes nowhere. `posting()` (`tests/e2e/api.ts`) waits for all of it.
- **Drive the UI for what the test is about; set up the rest through the
  API** (`tests/e2e/api.ts`). A request costs a fraction of a modal
  round-trip and cannot race the page. Each UI flow stays covered by at least
  one test that drives it.
- **Select in the editor by the editor's own selection.** The toolbar and
  the block settings panel act on the editor's selection, which follows the browser's a
  moment later. A key pressed just after a click (End, Home, Shift+arrows) can
  also be undone: when the click focuses the editor, ProseMirror writes its
  own selection back to the page a moment later. A spec that is not about the
  keyboard selects with `selectText()` (`tests/e2e/editor.ts`), through the
  Selection API, which returns once the editor's selection is the text. To
  make a keyboard selection reliable:
  - retry the click until the editor has focus;
  - press the positioning key until `editorSelection()` (`tests/e2e/editor.ts`)
    reports the caret where it should be, as `endOfLine()` does for End;
  - then extend the selection, and wait until `editorSelection()` shows the
    expected text before acting on it.
- **Expect other fonts than your own.** The browser sets text in the
  machine's system font, and CI's (DejaVu Sans on Ubuntu) has other metrics
  than a developer's, so text lands elsewhere and lines are of another height:
  - a size the specs measure, such as a 44px touch target, holds for every font
    only when the app sets it by token (`min-height: var(--ds-target-min)`),
    not by padding around a line of text;
  - a selection across blocks is made with `getSelection().setBaseAndExtent()`,
    not by a drag between two points of text, whose path runs over whatever
    the fonts put there. The editor takes it as it takes a drag's; wait until
    it has written its own selection back (`selectAcross()` in
    `src/lib/features/editor/e2e/cell-boundaries.spec.ts`). A drag stays the
    tool where the pointer is what is tested: a grip, a divider, a block moved.
- **Rows a test creates get unique names** (`unique()` in `tests/e2e/api.ts`),
  so the test can run twice against the same seed.
- **Keep a test's own rows out of other tests' site-wide queries.** A page
  other roles can read must not carry the seeded values that specs count
  across the site (`core:status = active`, the seeded tags), so give it a
  value of its own. Pages stay until the run ends, so one that matches turns
  up in every later query. That is why `createPage()` starts a page
  `restricted`: a new page inherits its namespace, and the test database's
  default namespace is public. A spec that needs the app's own default passes
  `visibility: null`.
- **Never open a seeded page in the editor, nor save its document.** Create a
  page of the test's own (`createPage()` in `tests/e2e/api.ts`), for two
  reasons:
  - **The edit lock.** The editor takes the page's edit lock, and a lock
    whose release is cancelled by the next navigation stays live for its
    timeout, turning away the next user to open that page's editor.
  - **The seeded images.** Saving a document drops the page images it does
    not reference, such as the seeded public page's image, and other specs
    rely on the seeded pages as seeded.
- **Find a toast inside its region:**
  `page.getByRole('region', { name: 'Notifications' }).getByText(…)`. The
  toaster repeats every message in a hidden live region a moment later, for
  screen readers, so an unscoped `page.getByText(message)` matches twice once
  that happens.
- **`count()` does not wait.** After `page.goto`, server-rendered rows are
  already there, so `if (await row.count())` is sound for them. Anything that
  appears only after hydration or a client request is not: wait for it, or
  for something always present beside it, first.
- **Keep long work splittable.** A spec file's tests run in one worker, one
  after another (`fullyParallel: false`), so one long spec can hold the whole
  run up. A file whose tests are independent declares
  `test.describe.configure({ mode: 'parallel' })`. A long loop over a list
  (sections, pages) runs as several tests over slices of it, as the
  design-system playground's axe sweeps do.

### Hydration

A page answers input only once it has hydrated. Before that, a click lands on
server-rendered markup that has no handlers yet, and nothing happens. The
root layout marks the document when it is ready (`data-hydrated` on
`<html>`), and every page a spec drives waits for that mark:
- `page.goto()` and `page.reload()` resolve only once an app page has
  hydrated (any SvelteKit page response, error pages included). This holds
  for pages of contexts a test opens itself too.
- Navigations inside the app are client-side and start hydrated.
- After a link that reloads the document (`data-sveltekit-reload`), or the
  browser's Back to a full page load, call `waitForHydration(page)` from
  `tests/e2e/fixtures.ts`.

So a spec's first click is a plain click. A retry loop belongs only where the
race is the component's own, such as a popover whose outside-click handling
can still take the click that reopens it; say so in a comment.

### The CSP guard

The `page` fixture of `tests/e2e/fixtures.ts` fails a test whose page reports
a content security policy violation:
- **What it covers:** any directive, any frame, across navigations, with the
  violation in the failure message.
- **Where it bites:** against the production build, every reader route a spec
  visits is checked under the strict policy. Editor and settings routes allow
  inline styles anyway.
- **Opting out:** a test that provokes a violation on purpose declares
  `test.use({ cspViolations: 'allowed' })`.
- **Not covered:** contexts a test opens itself with `browser.newContext()`.

`src/lib/shell/e2e/csp-style-src.spec.ts` covers what the guard cannot see:
- the headers of strict and loose routes;
- no `style` attribute in the served markup;
- the cascade under a site stylesheet;
- that the page stays usable after every overlay (a blocked style-attribute
  restore leaves it inert);
- that Edit is a full navigation.

### The responsive guardrail

`src/lib/shell/e2e/responsive.spec.ts` holds the rule that nothing scrolls
sideways at 360, 390 and 768 px ([responsive.md](../architecture/responsive.md#the-guardrail)):
- **What it covers:** representative pages built from
  `tests/e2e/responsive-probe.ts`, checked by `horizontalOverflow`
  (`tests/e2e/responsive.ts`): the page's scroll containers, every element's
  box and every text run.
- **The fingerprints:** the expected layout of the probe pages' containers at
  390 and 768 px is written in the spec. When a change to how pages collapse
  is intended, update the fingerprint with it; when it is not, fix the app.
- **Using it elsewhere:** a spec of a feature that renders something wide
  asserts `expect.poll(() => horizontalOverflow(page)).toEqual([])` at a phone
  width, which lists what overflows when it fails.

### Diagnosing a failure

Full runs record nothing: tracing and video on every worker cost enough to
push slow pages past their timeouts and invent failures. Reproduce a failure
alone, with a trace:

```bash
E2E_SERVER=built npx playwright test <spec> -g "<title>" --workers=1 --trace=on --repeat-each=3
npx playwright show-trace test-results/<test>/trace.zip
```

What the server said while a test ran is in its worker's log,
`tests/e2e/.servers/w<n>.log`, and what it stored stays in that worker's
database, `<base>_e2e_w<n>`, until the next run.

A failure that only CI shows is most often the fonts. It reproduces in
Playwright's Linux image, of the version `package.json` pins, with the
`fonts-dejavu-core` package installed and a Postgres beside it: a clone of
the branch inside the container, then `npm ci`, `npm run build` and the spec
through `node scripts/e2e.mjs app --skip-build -- <spec>`.

## CI contract

`.github/workflows/ci.yml` is this contract, run on every pull request and
on every push to `main` and to a release branch. The gate needs nothing but a database server: the runs make their
own databases and seed their own users, sessions and tokens.

1. **A database server:** a Postgres 16 service, with `DATABASE_URL` naming
   a database whose name contains `test` (unset, it defaults to
   `user:password@localhost:5432/owlgraph_test`). The runs' databases are
   derived from it ([The test databases](#the-test-databases)). The role
   creates databases from a template and creates the app's own role, so it
   needs CREATEDB and CREATEROLE; the Postgres image's user is a superuser.
   The build needs a `DATABASE_URL` to exist too, because SvelteKit's
   post-build analysis loads the server modules, which refuse to load without
   one, though nothing connects. Locally `.env` (from `.env.example`) gives
   it; the workflow sets the test database's for every step.
2. **Install:** `npm ci`, whose `prepare` script prepares SvelteKit's types
   and compiles the interface messages (fetching two inlang plugins from
   jsDelivr). Then `npx playwright install --with-deps chromium`, which the
   component tests use too.
3. **Run:** three jobs side by side:
   - **hygiene:** the third-party notices match the lockfile, nothing that
     must not be published is tracked, and no critical advisory affects the
     production dependencies;
   - **checks:** `npm run check` (the licence headers among its checks) and
     `npm test`, both before any build, so a
     fresh clone is shown to check and test as it is; then `npm run build`,
     `npm run test:int` and `npm run test:component`. With `CI` set, the
     HTTP tests fail rather than skip without a current build, and so do the
     operations tests without `PG_CONTAINER`, which the step sets to the
     service's container;
   - **e2e,** in two shards: each builds, then runs its half of the app lane
     (`node scripts/e2e.mjs app --skip-build -- --shard=<n>/2`); the first
     also runs the branded lane.
4. **On failure:** keep `playwright-report/` (HTML, written when `CI` is set),
   `test-results/` (one folder per lane, `<lane>/`) and the servers' logs
   (`tests/e2e/.servers/`).

With `CI` set, a stray `test.only` fails the run.
