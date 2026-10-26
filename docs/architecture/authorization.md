# Authorization & visibility

## The rule

> Decision: [0002. Authorization is server-enforced and viewer-scoped](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md).

Authorization is **server-enforced and viewer-scoped**. Every access
decision — UI request or MCP tool call — goes through `can(user, action,
resource)` and, for pages/documents, a resource-level visibility check.
Client-supplied identity is never trusted; embedded/dynamic queries (see
[dynamic-rendering.md](dynamic-rendering.md)) execute under the **current
viewer's** permissions, not the author's or an elevated one. UI gating is
never the only guard — the same checks run server-side regardless of what
the client shows or hides.

## The route-level gate

Before either check below runs, every request passes through `src/hooks.server.ts`'s
`PUBLIC_ROUTES` — an explicit allowlist of route ids composed from each feature's
own `routes/publicRoutes.ts` declaration (`src/lib/shell/publicRoutes.ts`; keyed off `event.route.id`,
matching SvelteKit's route pattern, e.g. `/[[namespace=namespace]]/[slug]`) that may be
reached without a session at all. A route **not** on this list is private by default: an
unauthenticated request is 303-redirected to `/login` (401 for `/api/*`) before its
`load`/handler ever executes — and thus before any `can()` or visibility check below
gets a chance to run.

Being on the allowlist doesn't mean "no authorization" — it means the route is fully
responsible for its own. Two shapes show up among the current entries:

- Re-deriving per-resource visibility internally: `/[[namespace]]/[slug]`
  (dispatches to a page, a document or a collection by node type — see routing.md for how the
  namespace segment resolves), `/api/media/[id]`, and `/api/documents/[id]/content` are
  public routes whose handlers apply the node check below (a restricted
  page/document still bounces an unauthenticated caller). The content route's `PUT`
  is a write, checked in the handler against document write access. `/search`
  lists through the list query, whose visibility predicate sits outside every
  filter, counts after it, ignores a namespace the viewer may not see, and
  offers only filter values found on readable content; a known class's name
  may appear in it whatever the viewer reads, since classes are vocabulary
  ([search.md](search.md#what-a-viewer-sees)).
- Unconditionally public, but gated on a positive identity check instead of visibility:
  `/api/media/branding/logo/[id]` serves a single global asset and has no
  owner/visibility to check, but must verify `kind === 'logo' && scope === 'global'`
  before serving — without that check, an id-keyed lookup would let the route double as
  an unauthenticated bypass of `/api/media/[id]`'s visibility gate for arbitrary asset
  ids.

The rule when adding a route: public access is opt-in, never inferred from what a
route serves — a new route that anonymous visitors must reach (a public asset, a
health check) needs its route id declared in its feature's `routes/publicRoutes.ts` explicitly, or every such
request dead-ends at `/login` regardless of what authorization logic the route itself
contains. Conversely, adding a route to the allowlist removes the coarse session gate
entirely for it — whatever resource-scoped check it needs (visibility, ownership,
kind/scope, or nothing at all for a truly public singleton) must live in the route's
own code, not be assumed from its presence on the list.

## What a browser keeps

Everything a signed-in viewer is sent was decided for them, at that moment:
what they may read, their connections, their name in the app bar. So every
response to a signed-in request that does not set a cache policy of its own
is sent `Cache-Control: private, no-store` (`src/hooks.server.ts`). Pages and
their data requests both get it. The browser then keeps no copy to show on
Back, so it asks the server again:

- after signing out, Back shows the sign-in, not the page last read;
- after connecting another service, Back shows the page as it now reads.

A response that sets its own policy keeps it. An image or a document's bytes
are `public` only when what they belong to is public, and `private, no-store`
otherwise ([media.md](media.md), [documents.md](documents.md)). An anonymous
visitor sees only what is public, so their responses carry no policy — except
through a share link, which shows them what is not: the page a link opens
(`/share/<token>`, and its data) and its content are sent `private,
no-store` to whoever follows it, so once the link is revoked Back shows
nothing of what it granted.

## Two checks

Every decision goes through one of two checks, each defined in exactly one
place — the role check in the auth feature (`src/lib/features/auth/authz.server.ts`),
the node check in the nodes feature (`src/lib/features/nodes/access.ts`,
pure, plus `access.server.ts` for the share/membership lookups):

1. **Role-based actions** — `can(user, action)`. Roles today are `admin`,
   `editor`, `viewer`, each mapped to a fixed set of actions in
   `ROLE_ACTIONS` (`authz.server.ts`); the `Action` vocabulary itself is
   declared in the feature's client-safe `types.ts`, since the settings
   surface derives its navigation from the same names. Read/write actions
   (`page:read`, `page:write`, `property:read`, `relationship:read`,
   `search`) sit beside one **`<resource>:manage` action per settings
   section** (`property:manage`, `property-group:manage`,
   `relationship:manage`, `class:manage`, `namespace:manage`,
   `navigation:manage`, `homepage:manage`, `footer:manage`,
   `branding:manage`, `font:manage`, `stylesheet:manage`,
   `page-layout:manage`, `locale:manage`, `integration:manage`,
   `user:manage` — see [settings.md](settings.md)), and one view,
   `installation:view`: how this installation runs, the admin half of the
   About page (`/-/about`). A role is a bundle of these: admin holds
   every action, editor and viewer no `:manage` action and not
   `installation:view`; there is no
   catch-all "is admin" action, so a future role between editor and admin
   (a knowledge manager holding the schema's four `:manage` actions) is a
   new bundle, not a change to any route. An unauthenticated caller
   (`user` is null/undefined) is denied everything.

   The route-level form of this check is `requireAction(user, action)`
   (`src/lib/features/auth/routes/requireAction.server.ts`, a SvelteKit
   adapter that throws 403): every gated route adapter calls it in its
   `load` **and in every form action**, because actions resolve from the
   nearest `+page.server.ts` and run before any layout load — a layout-level
   guard alone never protects a direct POST.
2. **Per-node visibility** — `canReadNode` / `canWriteNode(user, node, kind)`,
   given a node's **effective** visibility —
   `coalesce(node.visibility, node's namespace's access_level)`, since
   `nodes.visibility` is nullable (see "Namespaces" below):
   - `public` — readable by anyone, even unauthenticated.
   - `internal` — readable by any signed-in user.
   - `restricted` — readable only by its owner (`created_by`), an admin, or
     one of two access subjects depending on *why* it's restricted: a
     namespace member, if the node inherits a restricted namespace
     (`visibility IS NULL`); or a user it's explicitly shared with, if the
     node was explicitly overridden to `restricted`. Never both at once.

   `visibility` and `created_by` live on the shared `nodes` row (see
   [architecture/overview.md](overview.md#the-node-model)), not on `pages`/
   `documents` themselves — so this check is defined once for every node type.
   SQL call sites compose the same predicate via `readableNodes()`
   (`src/lib/features/nodes/nodes.server.ts`) rather than each hand-rolling it;
   the pure functions in `access.ts` take one `NodeAccess` shape
   (`{visibility, created_by, namespace_access_level}`), regardless of which
   table it was joined from. The only difference between the node types is
   the write policy (`kind`): a shared or namespace-member user may write a
   page, while a document is writable only by its owner or an admin. A
   collection is written like a page — its members are curated together — but
   has no share list, so a restricted one with a visibility of its own is its
   owner's and an admin's.

   Admins bypass visibility for reads. Writes additionally require the
   `editor`/`admin` role — `viewer` never writes regardless of visibility.
   For a `restricted` page, the owner (or admin) always writes, and so does
   whichever access subject granted the read in the first place — a
   namespace member (inherited restriction) or a `page_shares` entry
   (explicit override): **restricted's two access subjects are full trust
   relationships, not read-only grants**, so read-eligible and
   write-eligible are the same population there (see "Group-as-access-
   subject" below for why). Document writes are stricter still: owner or
   admin only, no editor bypass, regardless of visibility — unrelated to
   the page rule above, and not something this changes.

This two-check shape (a coarse role check, then a node check) is
deliberate: it's what lets finer-grained access control (explicit grants,
tenant membership) slot in later without changing every call site's
signature.

## Namespaces: `access_level` is a live default, overridable per node

Every node also belongs to a namespace (`nodes.namespace_id`, see
[routing.md](routing.md#namespaces)), and every namespace carries an
`access_level` (`public`/`internal`/`restricted`). `nodes.visibility` is
**nullable**: `NULL` means "no per-node override — inherit this namespace's
`access_level`, live"; a non-null value is an explicit per-node override,
authoritative regardless of the namespace.

**Narrowing-only is universal, not scoped to restricted namespaces.** A
namespace's `access_level` is an **upper bound** on how accessible any of
its nodes may be — a per-node override (explicit, at creation via
`createPage`/`createDocument`'s `opts.visibility`, or afterward via
`setNodeVisibility`) may only make a node *more*
restrictive than its namespace, never less: a node in an `internal`
namespace can never be explicitly set to `public`, exactly as a node in a
`restricted` namespace can never be set to `internal`/`public`. The reason
is the same in both cases — an anonymous or under-privileged viewer must
never be able to read content whose namespace says it requires more —
restricted-namespace secrecy is one instance of this general rule, not a
special case of it. Moving a node into a stricter namespace while it
carries a now-too-wide explicit override silently auto-narrows it to fit
(never rejected — see `setNodeNamespace` in `nodes.server.ts`), and so does
lowering a namespace's own `access_level`: every override in it wider than
the new level is narrowed to it in the same transaction
(`setNamespaceAccessLevel`). Widening beyond a namespace's bound is
deliberately not supported via `visibility` at all — it's the share-link
mechanism's job (a separate, namespace-bypassing grant), not this one's.

**`public` is never an override.** Under narrowing-only an explicit
`public` could only ever equal a public namespace's own level — and it
would outlive that namespace being narrowed later. So a node is public only
by inheriting a public namespace: a request for `public` in a public
namespace is stored as `NULL` (inherit), and refused anywhere else. The
access panel follows the same shape: its choices are *Same as namespace*
(`NULL`, labelled with the namespace's current level), *Internal* (offered
unless the namespace is restricted) and *Restricted* — any override can be
returned to inherit there, and `PATCH /api/pages/[id]` /
`/api/documents/[id]` take `visibility: null` for it.

**A new instance starts closed.** The default namespace is seeded `internal`,
so a fresh site publishes nothing until an admin raises its access level —
and because every new node stores `visibility` `NULL` (a page from the
Create wizard included), raising it publishes *every* node in that
namespace that has no override of its own, at once. That is the price of
"inherit, live": the admin UI states how many nodes inherit before the
change is saved, and a node that must stay closed — a draft still being
written — carries its own explicit, narrower `visibility`.

Every read path resolves `coalesce(node.visibility, namespace.access_level)`
— `canReadNode` via a `namespace_access_level` field on
the row, `readableNodes()` via a scalar subquery — so this is genuinely the
third
authorization check the two-check model above always left room for.

Raising or lowering a namespace's `access_level` therefore changes every
non-overridden node in it, immediately; moving a node into a
different namespace does too, unless the node already carries an explicit
override (in which case the override is auto-narrowed to fit the new
namespace, never rejected — see `setNodeNamespace` in `nodes.server.ts`).

### Group-as-access-subject: restricted-namespace membership

A **restricted** namespace has a membership (`namespace_members` — users
today, shaped so a first-class `groups` concept can slot into the same role
later) managed under `namespace:manage` via `/settings/namespaces`. For a
node that *inherits* a restricted namespace (`visibility IS NULL`), the
access subject is that membership: owner, admin, or a current member of the
node's current namespace. This is distinct from the older per-node
`page_shares`/`document_shares` mechanism, which now only applies to a node
**explicitly** overridden to `restricted` — an inheriting node's membership
and an overridden node's shares never cross-apply (being on one page's
share list grants nothing on a different page, whether or not it's in the
same namespace).

**Both access subjects are full trust relationships — read *and* write —
not read-only grants.** A namespace member is trusted the same way any
editor is trusted with an internal/public page (that's the whole point of
symmetry with the other two access levels: an admin curated who belongs in
the namespace, so members write there like editors write anywhere else).
An explicit `page_shares` entry carries the *same* trust, just narrowed to
a hand-picked subset of people — `page_shares` is a **narrowing**
mechanism, and the selected users are always a subset of who'd already
reach the page via its namespace. This is **not** a share link: a share
link (`/share/[id]`, its id the link's unguessable token) is the opposite
shape — a **widening** grant to someone who would *not* otherwise have
namespace-level access at all (e.g. a public link into an internal page).
Whoever follows it reads exactly that one page or document, whatever its
namespace or visibility, until a writer of the node revokes it; it works
outside namespace-based routing entirely, and reads as an anonymous visitor
would, never by the visitor's session (what a browser keeps of it:
[What a browser keeps](#what-a-browser-keeps)). The two must never be
conflated: `page_shares`/`visibility` never widen past a node's namespace; a
share link never narrows within one.

Two enforcement layers, both membership-driven:

- **Node gating** (can the user read this node) — the `coalesce(...)`
  resolution above, live, across every read path (routing, media/document
  serving, GraphQL `nodes`/`search`, the graph, MCP).
- **Namespace-entity gating** (can the user even see/select/route into the
  namespace) — `listNamespacesForUser()` (`namespaces.server.ts`) omits a
  restricted namespace the viewer isn't a member of (or admin) from every
  viewer-facing namespace picker (the create modal, `AccessControlPanel`).
  `/settings/namespaces`'s own listing stays unfiltered — admins manage
  everything. `/api/namespaces/slugs` (the client-side routing
  params-matcher's data source) answers per viewer with the same rule —
  public namespaces for everyone, internal ones once signed in, restricted
  ones to members — so a namespace's existence is not revealed to someone
  who cannot reach it. The default namespace has no slug and routes at the
  root without it. The server's own matcher registry holds every slug
  ([routing.md](routing.md#namespaces)).

**Known limitation, not a bug:** a removed member who is also a node's
*owner* keeps read/write access to their own nodes after removal — the
owner-always-retains invariant is unconditional. The intended fix is a
future **ownership transfer** feature (reassign ownership to someone else,
after which plain rules lock the removed user out); until then this is
documented as an accepted gap, not something callers should build around.

Placing content into a restricted namespace (creating a node there, or
moving one in) requires membership or admin — `createPage`/`createDocument`/
`setNodeNamespace` all call `assertCanPlaceInNamespace` and reject a
non-member with `NAMESPACE_MEMBERSHIP_REQUIRED` otherwise.

`namespace:manage` (admin-only) gates the namespace entities themselves —
creating/renaming/deleting a namespace, setting its `access_level`, and
managing its membership — via `/settings/namespaces`. It does **not** gate
reassigning an individual node to a different namespace, which is treated
as an ordinary content edit (`page:write` / document ownership, same check
as changing `visibility`), not a namespace-management action — though that
edit is still membership-gated as described above.

Deleting a namespace never deletes its content: its nodes move into the
default namespace (a slug that collides there gets a suffix), and a node
that inherited the deleted namespace's access level inherits the default's
from then on. That can widen it — a page only members could read becomes
readable by everyone the default namespace admits. The deletion makes no
choice for the admin; moving the content on into a namespace of the right
level is theirs.

The same schema-vs-content split applies to the class hierarchy
([semantic-layer.md](semantic-layer.md)): `class:manage` (admin-only) gates
defining domain classes under `/settings/schema/classes` (the root and the node
types are core schema, not admin-createable), while assigning a class to a
node is an ordinary content edit of that node.

## A collection's members

A curated collection's members are written like its other facts: by whoever
may write the collection (`/api/collections/<id>/members`,
[semantic-layer.md](semantic-layer.md#collections)). Every member an editor adds, labels, moves or takes
out is one they may read — a member they may not read cannot be named, and
answers as not found. What they rearrange is the order of the members they
may read: each member hidden from them keeps its slot, so a rearrangement
neither moves nor reveals it. Every list of members — the collection's page,
its editor, `get_collection` — counts and numbers the members its reader may
read, from 1, so a gap never gives a hidden member away. A mirrored
collection's members come from its integration's source and refuse an
editor's change.

## What a page embeds

A collection or document block shows its node as the page's **reader** may
read it, never as whoever embedded it could
([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)): each block is
resolved for the reader before the page renders, through the same
visibility predicate every list uses. A member the reader may not read is
left out, the rest numbered among themselves. A collection or document the
reader may not read renders **nothing** — not its box, not its title —
since a placeholder would say that something is there: hidden is not
protected. A share link's visitor reads as anyone does (the link grants its
page, not what the page embeds), and a reader outside a restricted namespace
reads nothing of what is in it. An agent embeds only a node its owning user
may read (`append_block` refuses the rest), and what it embedded is pruned for
every reader like anyone's.

## Enforcement in practice

The MCP server (`src/mcp/server.ts`) applies exactly the same checks as the
web app: every tool call resolves a bearer token to its owning user, then
gates the tool by role (`can`) and, for page/document-scoped tools, by the
resource's visibility check — so an agent's reach is bounded by both its
owning user's role and each page's visibility, identically to a human user
of the same account.

## Edit lock

Editing a page takes its **edit lock** (`page_locks`, `features/pages/locks.server.ts`):
advisory coordination between people, not a permission — what a user may
write is decided by the rules above, and storage integrity by the save's own
row lock. The lock belongs to a user and is proven by a token, reissued on
every acquire; the editor renews it with a heartbeat (20 s, TTL 60 s) and
releases it when it leaves. Another user meets a *Page is being edited* card
(an admin may take over); the same user always gets the lock, and the tab that
held it loses its token. In the browser the lock's lifecycle is the editor
feature's `session/editLock.svelte.ts`, and a lost lock's draft its
`session/lostDraft.svelte.ts`, which the edit route
(`editor/routes/EditPage.svelte`) drives ([editor.md](editor.md#the-edit-session)).

The reader's own tabs coordinate in the browser (`features/pages/editTabs.ts`,
a BroadcastChannel): a tab opening the editor while another tab of the same
browser edits the page asks first — *Already open in another tab*, edit here or
only view — and the tab that takes the lock says so, so the other one steps
aside at once. A tab that loses the lock with nothing unsaved says where
editing went (another tab, or elsewhere) and offers to edit here again; only a
tab holding unsaved work saves it as a draft version — stored as a save
stores a page, sanitized and without the editor's placeholders — and offers
to reconcile it with the page. Another browser or device of the same user is
outside that channel: its tab learns of the loss from the heartbeat. The
reconcile compares the draft with the page as the editor would hold it
(`EditorCore.heldJSON`): a page last written by an agent or the API leaves
out attributes the editor gives every block, so compared as stored every
block would read as changed, and applying them would put back what the other
editor saved. Both sides are compared without placeholders
(`pages/pageDiff.ts`): the editor fills each empty cell with one, never
stored and with a new id each time it reads a page, so with them every block
holding an empty cell would read as changed the same way.

## Credentials at rest

The database holds no usable credential of its own. Passwords are scrypt
hashes; session tokens, API tokens and share-link tokens are stored as the
SHA-256 of the token (`hashToken`), and only the holder — the session cookie,
the API client, the link — keeps the raw value. A database dump or backup
therefore grants no access to owlgraph. Account passwords must meet the policy
in `src/lib/features/auth/passwordPolicy.ts` (at least 12 characters, no
obvious ones), enforced wherever a password is stored.

After sign-in, the `?redirect=` target is honoured only when it resolves to a
path on the app's own origin (`safeRedirect.ts`) — one that dot segments
turn into another host (`/.//host`) included; anything else lands on `/`.

### Secrets

What owlgraph has to *use* rather than check — a credential an integration
presents to another service — cannot be a hash. It is stored **sealed**
(`platform/secretBox.server.ts`): AES-256-GCM under a subkey derived (HKDF) for
its purpose from the deployment's `APP_SECRET_KEY`, 32 random bytes in base64
that live in the environment, never in the database. A dump holds ciphertext
only, so it still grants nothing — and restoring it elsewhere needs the key,
which is backed up apart from the dumps ([backup.md](../guides/backup.md)); without it the
sealed values do not open and every integration has to be connected again.

- A sealed value is confidential and tamper-evident; one that was altered, was
  sealed for another purpose or under a key the deployment no longer has does
  not open, and is treated as absent.
- A **node's credential** — a share's token and password, kept for a
  collection and its documents — is sealed with the node it is for and the
  address of the service it was made for, and opens only as that node's and
  only while the integration points there: copied onto another node it opens
  as nothing, and once an administrator points the integration at another
  address no node's credential is sent to it, and each node is connected
  anew. A document made from a collection holds the collection's credential
  sealed anew for itself. Anything else stored for a node opens as nothing.
- Each value names the key it was sealed under, so a rotation needs no flag
  day: the old key moves to `APP_SECRET_KEY_PREVIOUS` (comma-separated for
  several), which only opens, and the new key seals from then on.
  `npm run secrets:rotate` re-seals what is stored under the new key; once it
  reports nothing left under the old one, the old key can go. A value under no
  key the deployment has is listed by node id — its source has to be connected
  again.
- A **grant** — a short-lived address that lets one viewer fetch one node's
  content from an integration — is sealed for a purpose of its own and never
  stored ([plugins.md](plugins.md#grants)).
- A person's **connection** to an integration's service — the credential
  that lets owlgraph read that service as them — is sealed for a purpose of
  its own in `user_connections`, one row per person and integration. The
  sealed value names the person, the integration and the address it was
  made for, and opens only for a row that says the same: copied to another
  row it opens as nothing, and once an administrator points the integration
  at another address it is never sent there. Reconnecting replaces the row,
  so whatever named the old one — a grant, a cached location — ends with it.
  A connect in progress keeps the service's handshake handle sealed
  server-side (`connection_flows`), bound to the session that started it:
  never in a browser, gone on sign-out, used once, minutes long.
  `secrets:rotate` re-seals the connections too; one under no key the
  deployment has is listed by connection id, and its person connects again.
- The key is optional: only an integration seals with it, and without one
  nothing seals — the integration refuses to connect. A key that is set has
  to be one: `migrate` refuses a weak one in production, and the startup
  summary reports it as `(set)`, `(unset)` or `(unfit)`, never its value.

### Requests to other services

The server reaches out to one kind of address only: an origin an
administrator configured for an integration — never one a client supplied,
never one found in content (an external-link document is redirected to, not
fetched: [documents.md](documents.md)). Every such request goes through
`platform/upstream.server.ts`, which holds its rules:

- the origin is a bare `https://` origin — no path, query, fragment or
  credentials; plain `http://` only for a loopback host, and only where
  `INTEGRATIONS_ALLOW_HTTP_LOOPBACK=1` allows it, which only the e2e harness
  sets ([testing.md](../guides/testing.md#servers)) — `migrate` refuses it in
  production, and both processes show it in their startup line;
- a request's path resolves against that origin and must stay on it, or
  nothing is sent;
- a redirect is never followed — a 3xx is an outcome, not a hop to wherever it
  points;
- 2 s to connect and 10 s for a whole exchange (a streamed body: 10 s to its
  headers, then 30 s between chunks), and a byte cap on every body;
- a few requests in flight per origin, the rest waiting their turn, so one
  page with many viewers cannot turn into a flood.

Nothing in it logs, and nothing that calls it logs a URL: a path to such a
service can carry a credential ([logging.md](logging.md)).

## Reading another service as the viewer

A node an integration backs is read the way its viewer may read it, and only
once owlgraph's own rules let them read the node at all — namespace access
and visibility come first, everywhere, and a connection never widens them:

1. **Their own connection** ([plugins.md](plugins.md#connections)): where the
   node's file or folder lies among the files the service lets them see — it
   is found by the service's own id for it, which every person it is shared
   with sees too — read as them. The service keeps enforcing its permissions:
   two people reading one node can see two different listings, each their
   own.
2. **Else the node's own credential**, when it has one (a share's link): what
   the share shows anyone who may read the node.
3. **Else nothing**, and a placeholder says why: a signed-in viewer may connect
   their account, or connect it again after the service refused it; for
   anyone else — an anonymous reader, a share link's visitor, a connected
   viewer whose files do not hold it — it is simply unavailable.

What one viewer finds through their connection is theirs alone: it is never
written to the node's shared record (no state, no path), never indexed for
search, and the plugin's caches of it are keyed by that viewer's connection
first. A service that refuses a connection is asked once — the connection
turns revoked and the node's own credential is tried instead — and never
again until the person checks or connects anew ("Check again", "Connect
again"): a refusal counts against this server's address at the service.

A grant names the connection it was made for and reads with that connection
or not at all — after a disconnect or a reconnect it answers "renew", never
falling back to the node's credential. Agents (MCP) read no service live: they
see a node's record, as every other reader does, and never a person's
connected files.

## Related pages

- [architecture/overview.md](overview.md) — where this sits in the request path.
- [dynamic-rendering.md](dynamic-rendering.md) — how query blocks stay
  viewer-scoped.
- `src/lib/shell/publicRoutes.ts` — the composed `PUBLIC_ROUTES` set, one
  `routes/publicRoutes.ts` declaration per feature; its unit test pins the
  composed set, so widening it is always a visible change.
