# Logging

owlgraph logs to **stdout/stderr as structured JSON**, through **one logger**, emitting
a **fixed catalogue of named events**. Nothing writes log files; retention is the
container runtime's job (see [Retention](#retention)).

The catalogue is the point. Logging "everywhere" produces text nobody queries; a closed
set of named events with stable fields produces a log you can ask questions of — *who
was denied what*, *which share links resolved*, *what changed in settings and by whom*.
Anything that is not a catalogue event is an error or it is silence.

---

## The logger

`src/lib/platform/logger.server.ts` exports the root logger (pino). Both processes use
it: the SvelteKit app and the standalone MCP server (`src/mcp/server.ts`) — same schema,
same redaction, same catalog. They are separate processes, not separate conventions.

Child loggers carry context rather than repeating it at call sites: the request logger is
a child bound to `{ reqId, routeId, userId }`, an MCP tool logger to
`{ toolCallId, tool, userId }`.

| | dev | production |
|---|---|---|
| format | pretty-printed, colourized (pino-pretty) | one JSON object per line |
| level | `debug` | `info` |
| destination | stdout / stderr | stdout / stderr |

`pino-pretty` is a **devDependency**, so it is absent from the production image
(`npm ci --omit=dev`) and that branch is never taken there; if it is missing
anywhere else, the logger falls back to plain JSON rather than failing at
import.

#### Setting the level

`LOG_LEVEL` overrides the default in either environment:
`error` │ `warn` │ `info` │ `debug` │ `silent`.

| where | how |
|---|---|
| `npm run dev`, `npm run mcp` | `LOG_LEVEL=` in `.env` (loaded by `dotenv/config`), or in front of the command |
| the compose stack | `LOG_LEVEL=` in the server's `.env` — `docker-compose.yml` passes it into both `app` and `mcp`. Apply with `docker compose up -d app mcp` |
| one container, ad hoc | `docker compose run -e LOG_LEVEL=debug --rm app node build` |
| unit tests | `silent`, set in `vitest.config.ts` — the modules under test emit real events, and a test run is not what that output is for |

**`info` is the resting level and is meant to stay there.** It already carries
every non-asset request, every audit event and every denial; the catalogue is
sized so that `info` is the complete operational picture rather than a
sampling of it. `debug` is for diagnosing a specific problem and carries no
guarantees — nothing a production question depends on lives behind it, and
nothing at `debug` is covered by the data rules below. Lower it again
afterwards.

Raising the level does not change rotation: each service still keeps
5 × 10 MB, so a noisier level buys less history, not more disk.

Note for anyone changing the default: the level is resolved with `||`, not
`??`. Compose writes `LOG_LEVEL: ${LOG_LEVEL:-}`, which sets the variable to
an **empty string** when the host has not set it, and pino rejects an empty
level outright (`default level: must be included in custom levels`) — with
`??` that empty string would reach pino and crash both containers at startup.

pino's default `pid` and `hostname` are **off**: they are not in the base
fields below, and in a compose stack they say nothing `proc` and the
container's own log label do not.

`debug` is off in production and carries no guarantees — it is for working on the app,
not for operating it. Never put something a production question depends on behind it.

### Base fields

Every line carries these; per-event fields are listed in [the catalogue](#the-catalogue).

| field | type | meaning |
|---|---|---|
| `ts` | ISO-8601 | when. pino's own key is `time` and its default is epoch millis; both are overridden |
| `level` | `error`\|`warn`\|`info`\|`debug` | see [Levels](#levels) |
| `event` | string | the catalogue name, e.g. `auth.login_failed` |
| `proc` | `app`\|`mcp`\|`migrate` | which process |
| `reqId` | string | the request this line belongs to, where there is one |
| `userId` | uuid \| `"anon"` | the **viewer**, never their email or name |
| `routeId` | string | SvelteKit's `event.route.id`, e.g. `/share/[id]` — never a URL |
| `audit` | `true` | present only on [audit events](#the-audit-subset) |

## Levels

| level | means | examples |
|---|---|---|
| `error` | broke unexpectedly; someone should look | unhandled exception, 5xx, DB unreachable |
| `warn` | expected but notable | 403, rate limit, sanitizer/upload rejection, slow request, CSP violation |
| `info` | a catalogue event happened | requests, logins, audit events |
| `debug` | development only | — |

**An expected outcome is never `error`.** A 404, a 403, a validation rejection and a
declined upload are all things the system is *supposed* to do. Logging them at `error`
is how an error log stops being actionable, and then stops being read.

## Correlation

A **request id** is minted per request in `hooks.server.ts` and put on
`event.locals.reqId`. Every line emitted while serving that request carries it, including
the error line.

It is also the **error ID** shown to the user. `handleError` returns `{ message, id }`;
`src/routes/+error.svelte` renders the id under the message. A user who reports "I got an
error, the id was `7f3a…`" has handed you the exact `reqId` to grep for — which is the
whole reason the id is surfaced rather than kept internal.

MCP tool calls get their own **`toolCallId`**, minted in `src/mcp/registry.ts`, playing
the same role for the MCP process.

---

## Data rules

These are not style preferences. The log is a durable artifact that leaves the
application's trust boundary — it is read by operators, shipped to whoever runs the
host, and retained for as long as rotation allows.

### URLs in logs

> **Every URL that reaches a log passes through `safeUrl()`**
> (`src/lib/platform/safeUrl.ts`).

A URL in this app can *be* a secret. `/share/<token>` and `/share/<token>/content` carry a
capability token in the path, and that token **is** the authorization — it is checked
against `share_links.token_hash` and nothing else, independent of the node's visibility
or the viewer's session. Anyone who reads it out of a log file holds the grant. Query
strings carry search terms (`/api/node-search?q=…`), which are page content by proxy.

`safeUrl()` reduces a URL to its route shape and discards the rest: query, fragment,
userinfo, and any path segment that is not a literal segment of the route tree.

| in | out |
|---|---|
| `https://host/share/FAKEshareTOKENforTESTS00?download` | `/share/[id]` |
| `/api/node-search?q=confidential%20project` | `/api/node-search` |
| `/quarterly-board-notes` | `/[id]` |
| `https://user:example-password@cdn.example/a/b` | `https://cdn.example/…` |
| `chrome-extension://abcdef…/inject.js` | `chrome-extension:…` |
| `inline`, `eval` (CSP keywords, not URLs) | unchanged |

It is **default-deny**: `routePattern()` keeps only segments it recognizes and rewrites
every other one to `[id]`. A route added without updating `ROUTE_SEGMENTS` degrades to
less detail — never to a leak — and `safeUrl.test.ts` pins the set against `src/routes`
so the degradation is caught rather than lived with.

Where a real `event.route.id` is in hand, **log that instead**: it is the exact route id,
and `safeUrl` is only an approximation recovered from a URL string. `safeUrl` is for URLs
that arrive as text — a browser's CSP report, an error, a header.

### Redaction

pino is configured with these paths. Redaction is a **backstop**, not the control: the
control is that call sites bind `userId`, never a user object.

```
req.headers.authorization   req.headers.cookie      res.headers["set-cookie"]
password  newPassword  currentPassword  passwordHash  password_hash
token  rawToken  sessionToken  apiToken
email  name
doc  html  css  bytes  sample
secret  sealed  shareToken  sharePassword
appPassword  loginName  pollToken  credential  handle  approveUrl
```

`email` and `name` are on the list because **`SessionUser` carries both**
(`src/lib/features/auth/auth.server.ts`), and it is what `locals.user` and the MCP
registry's `user` hold. `logger.child({ user: locals.user })` would emit a user's email
on every line of their session. Bind `{ userId: locals.user?.id ?? 'anon' }`.

`tokenHash` is deliberately **not** redacted — it is already a truncated hash (below).

### Never logged

| never | why | log instead |
|---|---|---|
| raw URLs | capability tokens, search terms | `routeId`, or `safeUrl()` |
| share-link / API / session tokens | they are the credential | `tokenHash`: first 12 chars of the SHA-256 |
| passwords, and anything about their value | — | the failure *class* only |
| emails, display names | DSGVO data minimization | `userId` (a real `users.id` — pseudonymous, not anonymous) |
| IP addresses | rate limiting works without recording them | nothing |
| search terms | page content by proxy | `termLength`, `hitCount` |
| page/document content, HTML fragments, CSS source, uploaded bytes | — | ids, sizes, counts, hashes |
| upload filenames | user content, often personal | `kind`, `reason`, `bytes` |
| structured settings payloads (nav tree, theme, CSS, schema) | too large, often content | `section` + `contentHash` |
| CSP `script-sample` | up to 40 characters of the offending style — content | nothing |
| CSP `original-policy` | contains this response's style nonce | nothing |
| bound SQL parameters | token hashes, password hashes, whole documents | `queryName` |
| a request URL to an integration's service | its path can carry the credential (a share token is a path segment) | `plugin` + `operation` |
| an integration's credentials, sealed values | they are the credential, or open to it | nothing |

**postgres.js's `debug` option must stay off.** It fires at send time (so it cannot
measure anything) and receives the bound parameters — which across this codebase include
`hashToken()` values for sessions, API tokens and share links, `hashPassword()` output,
and whole Tiptap documents via `sql.json(doc)`. It is unusable and unsafe; see
[`perf.slow_query`](#performance-and-limits) for what to do instead.

### The DSGVO inventory

> **The log is pseudonymous, not anonymous — it is personal data.**

`userId`, `actorId`, `subjectId` and `granteeIds` are the **real
`users.id` UUIDs**, not per-session or rotating identifiers. That is
deliberate and not a defect: an audit trail whose actor cannot be resolved
answers nothing, and "who changed this namespace's access level" is the
question the subset exists for. But it means a `userId` is linkable to a named
person by anyone who can also read the `users` table, so under Art. 4(5) GDPR
(DSGVO) this is pseudonymisation, and the log falls in scope as personal data.
It belongs in the record of processing activities (Verzeichnis von
Verarbeitungstätigkeiten) and the privacy policy (Datenschutzerklärung).

`nodeId`, `namespaceId` and `shareLinkId` are likewise real database ids. They
identify content, not people — but a node id plus the database still resolves
to a title and an author.

What the log does **not** contain, by construction:

| not recorded | how it is avoided |
|---|---|
| IP addresses | the rate limiters key on the client address but never log it; `auth.rate_limited` carries the limiter's *name*, never its key (which for `login-email` is `${ip}:${email}`) |
| email addresses, display names | never bound — call sites pass `userId`; `email`/`name` are on the redaction paths as a backstop |
| URLs, and the paths inside them | `routeId` (`/share/[id]`) or `safeUrl()`; never `event.url` |
| search terms | `/api/node-search?q=…` is logged as its route id; the query string is discarded |
| page or document content, HTML, CSS | ids, counts and hashes only |
| upload filenames | `kind`, `reason`, `bytes` |
| session, API and share-link tokens | truncated SHA-256 (`tokenHash`), or nothing at all |

**Retention** is bounded by container log rotation ([below](#retention)) —
by volume, not by time — and there is no deletion job. A `userId` in an audit
line therefore outlives the account: deleting a user removes the row that
resolves the id, but the id stays in whatever log files have not rotated out.
Treat the rotation window as the retention period when answering a request
for access or erasure (Auskunfts- or Löschungsersuchen).

**One residual channel worth knowing about:** `error.unhandled` logs an
unexpected error's `message` and `stack`. Those come from wherever the error
came from, so an exception raised by a library *could* quote a value it was
handling. The common cases are clean — a Postgres unique violation puts the
offending value in `detail`, which is not read, not in `message` — but this is
the one field that is not an allow-list. If that is not acceptable for a given
deployment, drop `stack` and replace `message` with `errorClass` in
`hooks.server.ts`'s `handleError`; the `reqId` still ties the line to the
request.

---

## The catalogue

Fields listed are **in addition to** the [base fields](#base-fields). `audit` marks the
[audit subset](#the-audit-subset).

### Lifecycle

| event | level | fields | emitted at |
|---|---|---|---|
| `app.start` | `info` | `version`, `nodeEnv`, `config` (redacted summary) | `hooks.server.ts` module scope; `src/mcp/server.ts`'s listen callback |
| `app.stop` | `info` | `signal`, `uptimeMs` | the `SIGTERM`/`SIGINT` handler in each process |
| `migrate.run` | `info` | `applied` (filenames), `adopted` (the baseline and how many migrations it replaced, on the run that recorded it in their place), `outcome`, `durationMs`, `note` | `migrate.server.ts`'s `runMigrations` |

`config` reports variables and their *fitness*, never their values.
`DATABASE_URL` is given only as `(set)`/`(unset)`: it embeds `APP_DB_PASSWORD`.
`APP_SECRET_KEY` only as `(set)`, `(unset)` or `(unfit)`
([authorization.md](authorization.md#secrets)); a deployment whose summary shows
`INTEGRATIONS_ALLOW_HTTP_LOOPBACK` set carries test tooling.

`app.start` carries **no migration state**. The obvious source,
`listMigrationVersions()`, resolves `migrations/` relative to its own module,
which is wrong once the app ships as a bundle under `build/` — and reading it
from the database would put a round-trip in front of startup, which the
namespace-cache warm beside it deliberately avoids. It is not needed anyway:
the `migrate` one-shot logs `migrate.run`, and compose only starts `app` and
`mcp` once that container has exited successfully.

`migrate.run` is one line per run whatever the run had to say — the per-file
warnings (a `.no-tx.sql` with more than one statement) are collected into
`note` rather than logged separately.

`app.stop` records that the signal arrived; it never calls `process.exit`
itself in the app, which would cut the requests adapter-node is draining.

### Requests

| event | level | fields | emitted at |
|---|---|---|---|
| `http.request` | `info` | `method`, `status`, `durationMs` | `hooks.server.ts`, in a `finally` wrapping the whole `handle` |

Every non-asset request, at `info` — fine at this scale. Requests with
`event.route.id === null` (static assets) are skipped; that null *is* the asset test.
The timer must wrap the entire `handle` body: the rate-limit, auth-redirect and 401
early-returns never reach `resolve()`, and a request that was rate-limited is exactly
one you want in the log.

### Auth

| event | level | fields | emitted at |
|---|---|---|---|
| `auth.login_ok` | `info` | — | `routes/login.server.ts` |
| `auth.login_failed` | `warn` | `failureClass`: `no_such_user`\|`inactive`\|`bad_password`; `userId` is `"unknown"` when there is no user | `auth.server.ts`'s `login()` |
| `auth.logout` | `info` | — | `routes/logout.server.ts` |
| `auth.session_invalidated` | `info` | `reason`: `expired`\|`deactivated`, `subjectId` | `getSessionUser`, where the session actually dies |
| `auth.api_token_used` | `info` | `tokenId` | `getUserByToken()` on success |
| `auth.rate_limited` | `warn` | `limiter`: `login-ip`\|`login-email`\|`graphql-ip`\|`mcp-preauth`\|`mcp-user`\|`integrations-ip`\|`integrations-credential`\|`connections-user`; `retryAfterMs` | `hooks.server.ts`'s `tooManyRequests()`; `src/mcp/server.ts`; `api.plugins.server.ts` (a plugin route's budget, and its failed credential checks — [plugins.md](plugins.md#routes)); `api.collectionSource.server.ts` (the same checks); `api.connections.server.ts` |

`login()` returns a `LoginResult` discriminated union carrying the
`failureClass`, so the adapter can log it. The response the user sees stays
identical for all three ("Invalid email or password") — telling an attacker
which half they got right is the enumeration they were after. **The email is
never a field**, not even for `no_such_user`, and not as part of the
`login-email` limiter key, which is `${ip}:${email}`.

There is no `auth.session_invalidated` for a password change or an admin
deactivation: `user.password_changed` and `user.activation_changed` already
record those, with the actor and the subject, which is strictly more.

### Authorization

| event | level | fields | emitted at |
|---|---|---|---|
| `authz.denied` | `warn` | `action` (e.g. `page:write`, `branding:manage`), `resourceType`: `page`\|`document`\|`namespace`\|`route`\|`tool`, `resourceId`, `via`: `route`\|`api`\|`mcp` | five places, below |

This is the "why can't I see X" line *and* the probing line, so it has to cover every
denial path:

1. `requireAction()` — the guard every `/settings` adapter's `load` and every one of its actions already calls (83 call sites across 14 adapters).
2. `apiForbidden()` — its counterpart for the API, which every `403` in `lib/features/*/routes/api.*.server.ts` now returns. A helper rather than a guard because those checks are per-resource (`userCanWritePage` / `userCanWriteDocument`), so only the caller knows *which* resource was refused; the log line looks identical wherever it came from. It also covers the `NAMESPACE_MEMBERSHIP_REQUIRED` refusals surfaced from the model.
3. `hooks.server.ts`'s unauthenticated gate — `action: 'session:required'`, `userId: 'anon'`.
4. `src/mcp/registry.ts` — every denial in `tool`/`pageTool`/`documentTool`, plus the MCP bearer-token rejection (`action: 'token:required'`).

A rejected bearer token logs **nothing about the token** — not even a prefix.
Unlike a share link, it identifies nothing actionable.

### Security

| event | level | fields | audit | emitted at |
|---|---|---|---|---|
| `share.resolved` | `info` | `tokenHash`, `nodeId` | | `shareLinks.server.ts`'s `resolveShareLink()` |
| `share.not_found` | `warn` | `tokenHash` | | same, the null branch |
| `share.created` | `info` | `shareLinkId`, `tokenHash`, `nodeId`, `actorId` | ✔ | `api.pageShareLinks.server.ts`, `api.documentShareLinks.server.ts` |
| `share.revoked` | `info` | `shareLinkId`, `nodeId`, `actorId` | ✔ | `api.pageShareLink.server.ts`, `api.documentShareLink.server.ts` |
| `sanitizer.rejected` | `warn` | `kind`: `html-block`\|`svg`\|`custom-css`, `reason`, `issueCount` | | see below |
| `upload.rejected` | `warn` | `kind`: `image`\|`document`\|`logo`\|`font`\|`avatar`, `reason`: `type`\|`size`\|`content`\|`missing`, `bytes` | | six pipelines, below |
| `csp.violation` | `warn` | `directive`, `blocked`, `source`, `document`, `referrer` — **all four URL fields through `safeUrl()`** | | `src/routes/api/csp-report/+server.ts` |
| `csp.report_unreadable` | `warn` | `reason`: `invalid-json`\|`not-a-report`, `bytes` | | same route, when the body yields no violations |
| `document.extract_failed` | `warn` | `errorClass` | | `documents/extract.server.ts` — a PDF with no usable text layer is expected and non-fatal |
| `media.variant_failed` | `warn` | `assetId`, `width`, `errorClass` | | `api.mediaAsset.server.ts` — an image's copy ([media.md](media.md)) couldn't be made; the image itself is served instead |
| `db.notice` | `warn` | `routine`, `severity`, `code` | | `db.server.ts`'s `onnotice` |
| `integration.upstream_failed` | `warn` | `plugin`, `operation`, `failure`, `status?`, `durationMs` | | a request to an integration's service ([plugins.md](plugins.md)) failed or answered with an error — named by what it was for, never by URL |
| `integration.source_state` | `info` | `plugin`, `nodeId`, `from`, `to`, `reason?` | | a node's source changed state — reachable, revoked, moved |
| `integration.connection_state` | `info` | `plugin`, `connectionId`, `subjectId`, `from`, `to` | | a person's connection to an integration's service turned revoked (the service refused its credential) or active again — by connection id, never the account or the credential |
| `integration.connection_created` | `info` | `plugin`, `connectionId`, `subjectId`, `actorId`, `replaced` | ✔ | a person connected their account at an integration's service, or connected anew |
| `integration.connection_removed` | `info` | `plugin`, `connectionId`, `subjectId`, `actorId`, `reason`: `disconnect`\|`admin`\|`origin_changed`\|`replaced`, `remoteRevoked` | ✔ | a connection was removed — and whether the service forgot its credential too |
| `integration.connections_cleared` | `info` | `plugin`, `count`, `actorId` | ✔ | an administrator removed every connection to an integration's service |

`tokenHash` is the first 12 characters of the token's SHA-256 — enough to correlate two
lines about the same link, not enough to reconstruct it. `hashToken()` already computes
the full hash for the lookup, so this is free.

`sanitizer.rejected` kinds:
- **html-block** — `sanitize.server.ts`'s `sanitizeFragment()`, reached from `saveDoc` on every write. sanitize-html reports nothing about what it dropped and a second parse would double the cost of every save, so the signal is a length delta: `reason: 'content-dropped'` and nothing more specific, which is deliberately not enough to say *what* was dropped (that would be the content).
- **svg** — `svgSanitize.server.ts`'s `SvgRejectedError`, caught in `logoUpload.server.ts`.
- **custom-css** — `customStyles.server.ts`, where `compileFreeCss`/`compileStyleCss` return issues. `issueCount` and a fixed reason only: a `CssIssue` carries just a `message`, and that message can quote the selector or declaration it objected to — the admin's own CSS. The messages go to the form, where they belong.

**Not request-correlated:** the html-block, svg, font, logo and avatar events
are emitted from model code reached by several channels (the editor, an MCP
tool, a version restore), so they carry no `reqId`. Threading a logger through
`saveDoc` → `persistDocTx` → `sanitizeDoc` to gain one was not worth the
signature churn; the event still records that it happened.

`upload.rejected` pipelines: page images (`api.media.server.ts`), documents
(`documentUpload.server.ts`, shared by create and the content `PUT` — including the
`matchesDocumentType` magic-byte check), branding logos (`logoUpload.server.ts`, both the
pre- and post-sanitize size checks), fonts (`fonts.server.ts`'s woff2 magic bytes, size,
weight, style), avatars (`media/avatar.server.ts`).

The CSP endpoint is unauthenticated by nature — a browser has no session to offer — so
it is bounded on both axes: **30 reports per minute per IP** and **16 KiB per body**. A
body that is not a readable report is dropped at `warn` with its reason and byte count
and **never its content**: this endpoint accepts unauthenticated input, and echoing it
into the log would make the log the injection surface.

`db.notice` logs the notice's **structural fields only**, never the object:
a Postgres notice can carry `detail`/`where`/`query` fragments quoting row
values, which is an unbounded channel from the database into the log. The
`cleanup_tsquery_stopwords` notice stays filtered out — the search bar fires
per keystroke and it is benign.

`document.extract_failed` carries the error *class*, not its message: that
message originates in bytes the user supplied.

### Content

| event | level | fields | emitted at |
|---|---|---|---|
| `page.unknown_drop_refused` | `warn` | `pageId`, `via`: `save`\|`apply-picks`\|`mcp`, `count`, `types` | `api.page.server.ts` (`PUT`), `api.pageApplyPicks.server.ts`, the pages MCP adapter's write tools — a write of a page's document refused because it would remove blocks the build can't show that the writer did not name ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)) |

The event says how many blocks of which kinds, never their keys or what
they hold: a refusal is worth a line because a client or an agent is about
to lose content it cannot see, and the kinds say which plugin or version it
belongs to.

### The audit subset

| event | level | fields | emitted at |
|---|---|---|---|
| `node.created` | `info` | `nodeId`, `nodeType`, `namespaceId`, `actorId`, and for a document `source` (`upload`/`link`) | `createPage`/`createBlankPage`, `createDocument`/`createLinkDocument` (the documents route and MCP `create_document_link`) |
| `document.source_changed` | `info` | `nodeId`, `from`, `to`, `actorId` — never the address, which is content | `api.documentContent.server.ts`, when a `PUT` of the content switches a document between an upload and a link ([documents.md](documents.md#choosing-and-switching-the-source)) |
| `node.deleted` | `info` | `nodeId`, `nodeType`, `actorId` | `deletePage`, `deleteNode` (via their adapters) |
| `node.visibility_changed` | `info` | `nodeId`, `nodeType`, `from`, `to` (`null`: inherits the namespace), `actorId` | `api.page.server.ts`, `api.document.server.ts` |
| `node.shares_changed` | `info` | `nodeId`, `nodeType`, `granteeIds`, `addedIds`, `removedIds`, `actorId` | `setPageShares`, `setDocumentShares` (via their adapters) |
| `namespace.access_changed` | `info` | `namespaceId`, `from`, `to`, `actorId` | `setNamespaceAccessLevel` |
| `namespace.membership_changed` | `info` | `namespaceId`, `addedIds`, `removedIds`, `actorId` | `setNamespaceMembers` |
| `user.created` | `info` | `userId`, `role`, `actorId` | `settings.users.server.ts`'s `create` |
| `user.role_changed` | `info` | `userId`, `from`, `to`, `actorId` | `settings.users.server.ts`'s `update` |
| `user.activation_changed` | `info` | `userId`, `from`, `to`, `actorId` | `settings.users.server.ts`'s `setActive` |
| `user.password_changed` | `info` | `userId`, `actorId`, `self`: boolean | `settings.users.server.ts`'s `update`; `settings.profile.server.ts` |
| `settings.changed` | `info` | `section`, `permission`, `actorId`, and **either** `from`/`to` **or** `contentHash` | the 15 admin adapters below |

All carry `audit: true`.

**`node.shares_changed` and `share.created`/`share.revoked` are different things** and
must not be read as one:

|  | `node.shares_changed` | `share.created` / `share.revoked` |
|---|---|---|
| what | **narrowing** grants to named users (`page_shares` / `document_shares`) | a **widening** capability link (`share_links`) |
| who it lets in | those specific signed-in users | anyone holding the URL, signed in or not |
| key field | `granteeIds` (user ids) | `shareLinkId`, `tokenHash` |

The distinct field names are the tell: an audit line with `granteeIds` is a
named-user grant; one with `tokenHash` is an anonymous capability. Nothing carries both.

`user.password_changed` records **that** a password changed, who changed it and whose it
was. It carries nothing about the value — no length, no strength, no policy outcome.

**`settings.changed`** is emitted in each adapter *after* the mutation
succeeded — so it records a change, not an attempt — and carries the permission
that `requireAction` checked. Each adapter binds `section` and `permission`
once, so they cannot drift apart across its actions, and `operation` is the
action's own name.

Two of the 17 adapters do **not** use it: `/settings/users` and
`/settings/namespaces` mutations have dedicated audit events (`user.*`,
`namespace.*`) carrying the subject and its before/after, which is strictly
more than `settings.changed` would say. The other 15, and their permissions:

| adapter | `section` | `permission` |
|---|---|---|
| `content/routes/settings.fonts.server.ts` | `fonts` | `font:manage` |
| `integrations/routes/settings.integration.server.ts` | `integrations/<id>` | `integration:manage` |
| `pages/routes/settings.colorScheme.server.ts` | `color-scheme` | `branding:manage` |
| `semantic/routes/settings.schemaProperties.server.ts` | `schema.properties` | `property:manage` |
| `semantic/routes/settings.schemaClasses.server.ts` | `schema.classes` | `class:manage` |
| `semantic/routes/settings.schemaGroups.server.ts` | `schema.groups` | `property-group:manage` |
| `semantic/routes/settings.schemaRelationships.server.ts` | `schema.relationships` | `relationship:manage` |
| `site/routes/settings.branding.server.ts` | `branding` | `branding:manage` |
| `site/routes/settings.footer.server.ts` | `footer` | `footer:manage` |
| `site/routes/settings.home.server.ts` | `home` | `homepage:manage` |
| `site/routes/settings.languages.server.ts` | `languages` | `locale:manage` |
| `site/routes/settings.navigation.server.ts` | `navigation` | `navigation:manage` |
| `site/routes/settings.pageLayouts.server.ts` | `page-layouts` | `page-layout:manage` |
| `site/routes/settings.styles.server.ts` | `styles` | `stylesheet:manage` |
| `site/routes/settings.stylesheet.server.ts` | `stylesheet` | `stylesheet:manage` |

**`from`/`to` only for cheap, non-sensitive scalars** — a visibility level, a boolean, a
name, a font id. For a structured payload — the nav tree, the theme JSON, custom CSS, a
font binary, the semantic schema — log `section` and a `contentHash` (SHA-256, truncated
to 12) and nothing else. Two lines with the same hash mean nothing changed; two with
different hashes mean something did, and the payload itself is in the database where it
belongs.

In practice `from`/`to` is carried by the dedicated events — `user.role_changed`,
`user.activation_changed`, `node.visibility_changed`, `namespace.access_changed` —
which are the ones with a cheap before-value to read.

### Errors

| event | level | fields | emitted at |
|---|---|---|---|
| `error.unhandled` | `error` | `errorClass`, `message`, `stack` | `handleError` in `hooks.server.ts`; the MCP request handler; `/api/health`'s DB failure |
| `error.expected` | `info` for 404, `warn` otherwise | `status`, `errorClass` | `handleError`, by inspecting the status |

There is **one error path**, and it is narrower than it looks. SvelteKit calls
`handleError` for **unexpected** errors and for its own unmatched-route 404s —
**not** for an expected error raised with `error(...)`. So the two dozen
`throw error(404, …)` sites across the read/share/media/font adapters never
reach it, by design.

That is fine, because they are already recorded: `http.request` carries the
status of every request, and an authorization refusal carries its own
`authz.denied` with the action and the resource. `error.expected` covers what
is left — chiefly SvelteKit's own 404 for a path that matched no route at all.
Nothing is instrumented at the individual `throw` sites.

`handleError` returns `{ message, id }` — the shape `App.Error` declares in
`src/app.d.ts`. The message stays generic for unexpected errors; the id is the
`reqId`, which `+error.svelte` shows as the error ID. Under `/api/` the hook
puts it in the API's error body, as `internal` with that `id`
([routing.md](routing.md#errors)).

`http.request` is emitted from a `finally` that wraps the whole handler, so a
request that ended in an exception still produces its line (status `500`, since
no response was seen). The error's own cause is in the `error.unhandled` line
under the same `reqId`.

### MCP

| event | level | fields | emitted at |
|---|---|---|---|
| `mcp.tool_call` | `info` / `warn` when denied | `tool`, `toolCallId`, `durationMs`, `denied`: boolean, `denyReason` | `src/mcp/registry.ts`'s three wrappers |

Instrumenting the three registry wrappers (`tool`, `pageTool`, `documentTool`) covers
every tool from all seven feature adapters, including every denial — a tool module never
logs a call or a denial for itself, exactly as it never authorizes for itself. What a
tool does may still be an audited event of its own: `create_document_link` emits
`node.created` through the registry's `log`, as the HTTP route that creates the same
document does. An MCP request also gets a
`reqId`, bound in the Express handler, so its rate-limit, authz and tool-call lines
correlate the way an HTTP request's do.

A denial produces **two** lines, at two altitudes, on purpose: `authz.denied`
is the cross-channel "who was refused what", and `mcp.tool_call` is the
per-call record — which has to include denied calls, or the tool-call log
omits exactly the ones worth auditing.

**There is no `mcp.graphql` event.** It would carry nothing the log does not
already have: the MCP query tools go through `mcp.tool_call` like every other
tool, and the HTTP endpoint through `http.request` on `/api/graphql`. Its
point would be `cost`, and there is no cost or complexity instrument on the
schema — the only bounds are `getNodes`' `first<=50` clamp, the filter
depth/leaf caps in `nodeFilter.ts`, and the traversal caps below. Add the
event when there is something to put in it.

### Performance and limits

| event | level | fields | emitted at |
|---|---|---|---|
| `perf.slow_request` | `warn` | `durationMs`, `method`, `status` | the same `finally` as `http.request` |
| `perf.slow_query` | `warn` | `queryName`, `durationMs` | the `timed()` helper |
| `query.limit_hit` | `warn` | `limit`, `value`, `cap`, `via`: `page`\|`graphql`\|`mcp` | the five caps below |

**Thresholds**

| | threshold | why |
|---|---|---|
| `perf.slow_request` | **1000 ms** | above a second a human notices; below it, noise |
| `perf.slow_query` | **200 ms** | well under `QUERY_BLOCK_TIMEOUT_MS` (3000), so a slow query is visible long before it becomes a timeout |

**`timed(name, fn)`** (`src/lib/platform/logger.server.ts`) wraps a *call*, not the
database handle. Each timed function keeps its implementation untouched and
gains a thin exported wrapper:

```ts
export function searchPagesFts(...args: Parameters<typeof searchPagesFtsImpl>) {
  return timed('search.pages_fts', () => searchPagesFtsImpl(...args));
}
```

Wrapping the call rather than proxying `db` means `db.begin()`, `db.unsafe()` and
transaction-threaded `TxSql` handles need no special handling — they are already inside
the wrapped call. A future timing proxy can emit the same `perf.slow_query` shape, so
adopting one later is not a re-instrumentation.

`queryName` is a **stable label you assign**. Never SQL text, never parameters.
The labels, at their call sites:

| label | call site |
|---|---|
| `traversal.traverse` | `query/traversal.server.ts`'s `traverseNodes` |
| `traversal.hydrate` | `query/traversal.server.ts`'s `hydrateContentNodes` |
| `query.filter` | `query/filterSql.server.ts`'s `findNodesByFilter` over pages (`findPagesByFilter`: the GraphQL `nodes` query, query blocks) |
| `query.list` | `query/filterSql.server.ts`'s `findNodesByFilter` over every node type (the search page) |
| `query.count` | `query/filterSql.server.ts`'s `countNodesByFilter` (the search page's total, and the filter sheet's live count through `/api/search-count`) |
| `search.pages_fts` | `search/search.server.ts`'s `searchPagesFts` |
| `search.documents_fts` | `search/search.server.ts`'s `searchDocumentsFts` |
| `page.persist` | `pages/pages.server.ts`'s `persistDocTx` (the whole save transaction) |
| `graph.sync_edges` | `graph/graph.server.ts`'s `syncEdges` |
| `semantic.sync_properties` | `semantic/properties.server.ts`'s `syncProperties` |

This is deliberate partial coverage: the heavy paths, not every query. An unlabelled
query is not timed, and that is the accepted trade for not wrapping the pool.

**`query.limit_hit`** — the caps, all currently silent:

| `limit` | cap | where |
|---|---|---|
| `hop_candidates` | `MAX_HOP_CANDIDATES` = 200 | `traversal.server.ts`, the truncating slice |
| `step_accumulated` | `MAX_STEP_ACCUMULATED` = 500 | `traversal.server.ts`, both break points |
| `start_nodes` | `MAX_START_NODE_IDS` = 200 | `traversal.server.ts`; also `traversal.ts`'s `badInput` |
| `query_blocks_per_page` | `MAX_QUERY_BLOCKS_PER_PAGE` = 10 | `queryBlockExec.server.ts`, the `over` slice |
| `query_block_timeout` | `QUERY_BLOCK_TIMEOUT_MS` = 3000 | `queryBlockExec.server.ts`, the `state: 'timeout'` branch |

Truncation stays **silent to the caller** — `traversal.server.ts` degrades identically
whether a result was exhausted or capped, so that "not found" and "cost-capped" are
indistinguishable to someone probing. Logging it server-side does not change that: the
operator learns a cap was hit, the caller learns nothing.

`queryBlockExec.server.ts` also logs `error.unhandled` when a block fails for a
reason that is neither a timeout nor a cap. The *result* stays generic — that
function backs public render paths and must not leak schema detail to an
anonymous viewer — but the cause is logged.

---

## The audit subset

Events marked `audit: true` answer *who changed access to what, and when*: the
access-control, membership, share-link, role and settings mutations above.

They go **to stdout, like everything else**. There is no database audit trail yet. The
fields are defined now precisely so that adding one later is a **sink change, not a
re-instrumentation** — the events, their names and their fields are the trail's contract,
and they do not get to drift because a table appeared.

Consequences of stdout-only, worth knowing before relying on it: retention is the
rotation window, the trail is not queryable in the app, and an operator with host access
can edit it. A deployment that needs more forwards stdout to a log store of its own.

---

## Guardrail

`scripts/check-console.mjs` fails the build on `console.*` in application code. It runs
as part of `npm run check`, alongside `check-boundaries.mjs` and `check-ui.mjs` and in
the same style — regex over source text, no dependencies. There is no ESLint in this
project and this does not introduce one.

Allowed:

| path | why |
|---|---|
| `scripts/**` | CLI programs; stdout **is** their interface. Includes the `migrate` one-shot's entry point, `scripts/migrate.ts`. |
| `src/lib/paraglide/**` | generated by the paraglide vite plugin, gitignored |
| `**/*.test.ts`, `**/e2e/**` | test code |

Everything else logs through the logger. That includes `src/lib/platform/migrate.server.ts`:
it is imported *by* the migrate one-shot but is application code, and its warnings are
`migrate.run` fields.

A single-line escape hatch exists for the case the rule genuinely does not fit —
`// log-allow: <reason>` on the offending line or the line above it — and a
reason is required, not optional. Reaching for it twice in the same file means
the catalogue is missing an event.

The check strips comments before matching, so a `console.*` call *discussed* in
a doc comment is not mistaken for one, and it catches `console['log']` and a
destructured `const { log } = console` as well as the plain form.

Why this matters beyond tidiness: a console line is unstructured, unredacted
and uncorrelated. It carries no `reqId`, it is not covered by the redaction
paths, and whatever object is handed to it is serialized whole — which is how
an email, a token or a whole document ends up in the container log.

**Client-side error reporting is deliberately out of scope.** `hooks.client.ts`'s
`handleError` stays minimal and ships nothing to the server; the browser `console.error`
calls in `pages/client.ts` and `RenderedContent.svelte` are removed rather than
converted. Adding a reporting endpoint is a separate decision with its own privacy
consequences.

---

## Retention

Rotation belongs to the container runtime, not the application. `docker-compose.yml`
defines it once as an anchor and every service references it:

```yaml
x-logging: &logging
  driver: json-file
  options:
    max-size: 10m
    max-file: '5'
```

So each of `postgres`, `migrate`, `app` and `mcp` retains **at most 5 × 10 MB ≈ 50 MB**,
and `docker-compose.prod.yml` does not override it. Retention is therefore bounded by
**volume, not by time**: a busy week rotates faster than a quiet month. There is no
deletion job and no time-based guarantee — if a fixed retention period is ever required,
it is a change here, not in the application.

Reading them: see [deployment.md](../guides/deployment.md), "Logs / troubleshooting".
