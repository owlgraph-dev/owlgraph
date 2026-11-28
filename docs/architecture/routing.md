# Content routing & slugs

## The unified read/edit routes

All content — pages, documents and collections alike — reads at `/[[space=space]]/[slug]`
(`src/routes/[[space=space]]/[slug]/+page.server.ts`). `load()`
resolves the optional `space` param to a space (`resolveSpaceParam`,
`src/lib/features/spaces/spaces.server.ts` — absent → the default space), then the
slug to a node within it via `getNodeBySlug` (`src/lib/features/nodes/nodes.server.ts`), a
single indexed lookup, then dispatches on `node.type` — the node type its
class descends from (`page`/`document`/`collection`, see
[semantic-layer.md](semantic-layer.md)), cached on the node row precisely so
this dispatch needs no walk of the class hierarchy: a page renders its
content inline; a document renders a metadata/management view (title,
visibility, shares, download links); a collection its members, or what its
integration shows of its source. Editing lives at
`/[[space=space]]/[slug]/edit` for each (the document and collection
editors are forms over the same chrome).

There is no back-compat for the routes this replaced (`/p/[slug]`,
`/d/[id]`, `/edit/[id]`) and no slug-history: a changed slug's old URL
simply 404s. Old links are never redirected forward. The same policy
applies to a node's space: reassigning it (or renaming the space's
own URL prefix) changes the node's route, and the old URL 404s.

## Spaces

A **space** groups nodes under a URL prefix and is the binding point
for a default access level (see below). Every node belongs to exactly one
space (`nodes.space_id`, required). One space is the **default**
— `spaces.is_default`, enforced unique by a partial index — and is
root-routed: it has no slug (`spaces.slug` is `NULL` for it, checked by
`spaces_slug_null_iff_default_check`) and therefore no URL prefix. Every other
space has a real slug and routes at `/{space-slug}/{node-slug}`.

Spaces are managed via `src/lib/features/spaces/spaces.server.ts` (CRUD +
`resolveSpaceParam`) and the settings section at `/settings/spaces`,
gated by the `space:manage` authz action (see authorization.md).

**Access level is a live default, overridable per node.** `nodes.visibility`
is nullable: `NULL` means "inherit this space's `access_level`, live";
a non-null value is an explicit per-node override (narrowing-only —
never more accessible than the space). `canReadNode`/
`readableNodes` resolve `coalesce(node.visibility, space.access_level)`,
so raising or lowering a space's `access_level` retroactively changes
every non-overridden node in it, immediately — and for a **restricted**
space specifically, its membership (`space_members`) is the access
subject for its inheriting nodes (group-as-access-subject). See
authorization.md for the full model, including the two enforcement layers
(node gating vs. space-entity gating) and the documented removed-owner
limitation.

**Space deletion reassigns, never blocks**: deleting a non-empty
space (`deleteSpace`) moves all its nodes into the default
space inside the same transaction (suffixing a slug if it collides with
an existing default-space slug) and always succeeds. The default
space itself cannot be deleted.

### The routing ambiguity, and the params matcher that resolves it

Because the default space has no prefix, a 2-segment URL like
`/foo/edit` is structurally ambiguous between two readings: "default
space, slug `foo`, static `/edit` sub-route" and "space `foo`,
slug `edit`". This isn't a narrow edge case limited to a slug literally
being `edit` — SvelteKit's route sorter strips a *leading* optional segment
like `[[space]]` when ranking routes (it only preserves ranking
information for an optional segment at the very end of a route id), so
without a matcher, `[[space]]/[slug]` sorts *ahead of*
`[[space]]/[slug]/edit` for every URL, and a plain `[space]`
segment accepts any string — meaning the read route would greedily match
**every** `/{slug}/edit` URL in the default space (misreading it as
`space={slug}, slug="edit"`) and the editor would become unreachable
entirely, not just for pages named "edit" (`@sveltejs/kit`'s `sort_routes`
ranks them so). Reserving the word `edit` as a slug does not help: the read
route would still match every `/{slug}/edit`.

The fix is a **params matcher**: the space segment is declared as
`[space=space]` (`src/params.ts`), which SvelteKit ranks
as *more specific* than a plain dynamic segment — more specific segments
are tried first, and a *matched* dynamic segment outranks a plain one even
after the leading-optional-segment stripping above. If the first path
segment passes the matcher (is a known space slug),
`[[space=space]]/[slug]` wins and resolves `space=foo,
slug=edit`; if it doesn't (e.g. it's an ordinary default-space page
slug, "edit" or otherwise), SvelteKit falls through to `[slug]/edit`.

Since matchers must be synchronous, the matcher consults an in-memory
registry (`src/lib/features/spaces/spaceRegistry.ts`) rather than the database — a set
of known space slugs, deliberately kept free of server-only imports so
it can be shared by both the server matcher and the browser's own copy
(needed for client-side route selection, including SvelteKit's own
hydration-time re-resolution of the current route — see below). Two
independent copies exist:

- **Server** (`src/lib/features/spaces/spaces.server.ts`'s `refreshSpaceCache`):
  warmed once at server startup (`src/hooks.server.ts`, not awaited — a
  slow/unavailable DB at boot shouldn't block the server from starting) and
  refreshed after every space create/rename/delete. Always correct
  within one request of a change. It holds every space, whoever is
  asking, so `refreshSpaceCache` is its only writer: the browser layers
  below never write it during server rendering, where they would narrow it to
  one viewer's spaces for every request. Refreshes that overlap (two
  space changes at once) can finish out of order, so only a read newer
  than the last one applied lands.
- **Browser**, warmed in two layers:
  - **`src/hooks.client.ts`'s `init()`** — fetches `/api/spaces/slugs`
    (a small public endpoint) and is *awaited by SvelteKit itself* before
    it parses routes or hydrates the current page. This is the piece that
    matters for correctness: SvelteKit's hydration doesn't just trust the
    server-resolved route on a fresh page load — with client-side routing
    enabled (the default), it independently re-resolves the current URL's
    route client-side, via the same matcher. `+layout.ts`'s `load()` alone
    would warm the registry too late: it runs *after* hydration's
    route-matching, so the route of a page in a space would resolve to `null`
    right after the correct SSR paint, breaking anything keyed off
    `$page.route.id`/`$page.params` (the page canvas collapsing, the Edit
    button disappearing). `init()` is SvelteKit's own hook for async setup
    before hydration starts, so it closes that race by construction.
  - **`src/routes/+layout.ts`**, populated from `+layout.server.ts`'s
    viewer-scoped `spaces`, in the browser only (the load is universal,
    and also runs during server rendering): keeps the registry fresh across the *rest* of a live SPA
    session (e.g. picking up a space created in another tab on this
    tab's next navigation) — `init()` only runs once, at boot. If this
    layer is ever momentarily stale, the wrongly-guessed route leaf's own
    `load()` still does a fresh, correct DB lookup and 404s cleanly when it
    doesn't find a match — never a security issue or a data-shape
    mismatch, only a rare, self-healing 404 that a reload fixes. The admin
    spaces UI uses `use:enhance`'s default `refreshAll()` after
    every mutation, so the acting admin's own client cache is refreshed
    immediately; other users' already-open tabs pick it up on their next
    hard navigation.

### Building a node's URL

Resolving a URL to a node (above) is only half of routing — *building* one
also needs the space prefix. `nodePath(spaceSlug, slug, opts?)`
(`src/lib/features/nodes/nodePath.ts`) is the one function every call site uses: `null`/
`undefined` space slug means the default space (no prefix),
`opts.edit` appends `/edit`. Every query that returns a node for building a
link joins in its space slug — see `spaceJoin`/`spaceSlugColumn`
in `src/lib/features/nodes/nodes.server.ts`, the same pattern `readableNodes` uses for
visibility.

## Slug identity is per-space, not global

`slug` is a required column on `nodes` (`src/lib/features/nodes/nodes.server.ts`) — not on
`pages`/`documents` individually — and unique **per space**
(`nodes_space_slug_key` on `(space_id, slug)`), not globally. A page
in one space and a page in another may share a slug; two nodes in the
*same* space (page or document, either type) may not. This is what
makes the route resolver's lookup a single, space-scoped lookup rather
than a cross-type UNION: `getNodeBySlug(spaceId, slug)` doesn't need to
know a node's type in advance to find it. `assertSlugAvailable` (also in
`nodes.server.ts`) is the shared guard behind `renamePage`, `renameDocument`, and
`setNodeSpace` — it checks the reserved-word list below, then (for the
default space only) a space-name collision, then a plain
`select ... where space_id = $1 and slug = $2` against `nodes`.

## The ID-vs-slug invariant

The node ID is the stable internal identity — what's stored in `edges`
edges and in the `pageLink`/`docLink`/`quickLink` block attrs that
represent one piece of content referencing another. The slug (plus its
space) is the mutable, URL-only identity. Routing resolves
space+slug → ID; nothing internal resolves the other direction as a
stored value. This is why renaming a page or document, or moving it to a
different space, never breaks an inbound reference.

What it does mean: anything that renders a *link* to another node must
resolve that node's *current* space+slug fresh, at render/load time,
rather than trusting a cached one. Two call sites do this:

- The public renderer's `slugMap` (built by `linkSlugMap` in the graph
  feature's `graph.server.ts`, consumed in `render.server.ts`) — resolved
  once per page request for that request's reader, values are paths
  that already hold the space (`{space-slug}/{slug}` or bare `{slug}` for
  the default space). It holds only the targets the reader may read. A
  link to any other node, whether the reader may not read it or it is gone,
  renders without an address (`#`), so the two cannot be told apart
  ([authorization.md](authorization.md#what-a-link-shows)).
- The editor's link-href resolvers — the inline `pageLink`/`docLink` marks
  (`content/inline/`) and the quick link (`blocks/quickLink/tiptap.ts`)
  each take a `resolveHref`-shaped option (TipTap `addOptions()`),
  configured in `editorCore.svelte.ts` from an id→href map
  (built via `nodePath()`) from the editor's own loaded `pages`/`documents`
  lists. This is a load-time snapshot, not live-tracking — same staleness
  tolerance the editor already has elsewhere (e.g. its link-autocomplete
  data), and refreshed on the editor's next full load.

A stored `targetSlug`/`data-slug` attribute (where one exists, e.g. on
`pageLink`) is never the source of a rendered href, in the editor or on the
page: it carries no space, it goes stale, and it would show the address
of a node to a reader who may not read it. A quick link without a label
shows it in the label's place — on the page only to a reader who may read
the target.

## Reserved-word policy

`RESERVED_SLUGS` (`src/lib/features/nodes/nodes.server.ts`) is a hardcoded set of
top-level route segments a content-authored slug, or a space name, must
never collide with — SvelteKit always resolves a more specific static route
ahead of the `[[space=space]]/[slug]` catch-all, so a slug matching
one of these would silently become unreachable. `isReservedSlug` is checked
by:

- `assertSlugAvailable` (node slugs), on **rename only**, not on create
  (`slugify()`'s random suffix makes a create-time collision with a bare
  reserved word practically impossible).
- `assertSpaceSlugAvailable` (space names, `spaces.server.ts`), on
  **both create and rename** — space names are hand-typed by an admin,
  not suffix-uniquified, so a create-time collision is realistic.

Because both a space name and a default-space node slug occupy the
same first path segment, the two are also checked **against each other**,
symmetrically: `assertSlugAvailable` rejects a default-space slug that
matches an existing space name, and `assertSpaceSlugAvailable`
rejects a space name that matches an existing default-space node
slug.

This list has **no structural tie to `src/routes/`** — it must be updated
by hand whenever a top-level route is added or retired. One half of that is
pinned by a test (`src/lib/features/nodes/reservedSlugs.test.ts`): every
static top-level directory under `src/routes/` must be reserved, so a new
route that forgets the list fails the unit suite instead of silently
shadowing content. The other half — releasing a word once its route is
gone — is a judgment call made on retirement: `edit`, `documents`,
`avatar`, `branding`, `media`, and later `admin`, `properties` and
`account` (the settings pages moved under `/settings`) were all
released only after their routes were retired or moved; leaving them
reserved past that point would have blocked content from ever using those
words as a slug for no real reason. `p` and `d` stay reserved permanently
despite their own routes (`/p/[slug]`, `/d/[id]`) being retired, to avoid
ambiguity with old bookmarks/cached links.

## The `/api/*` convention

Endpoints that serve or mutate content programmatically — `/api/pages/*`,
`/api/documents/*`, `/api/media/*` (including its `avatar/` and
`branding/logo/` sub-paths) — live under `/api`. Human-navigable pages
never do. So the media-serving routes live at `/api/media/[id]`,
`/api/media/avatar/[userId]` and `/api/media/branding/logo/[id]` — one
backend concern, one space. New routes that serve bytes or accept
mutations should follow the same placement.

## Errors

Every JSON error the HTTP API answers has one body:

```json
{ "error": { "code": "slug_taken", "message": "That URL is already taken." } }
```

- **`code`** is the contract: lowercase `snake_case`, stable, and the only
  thing a client branches on. The facts a code carries sit beside it inside
  `error`: `lock_lost` its lock's `status`, `unknown_blocks_dropped` the
  `dropped` units ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)), `invalid_request`
  the `field`, `invalid_address` the `reason`, `too_large` the `limit` in
  MB, `unsupported_file_type` the `type`, `internal` the `id` the log has
  it under.
- **`message`** is one sentence for a person, in the request's interface
  language ([languages.md](languages.md#the-interface-language)). It never quotes
  internals — no database text, no stack, no path — and no client parses it.
- **The status** comes with the code: the same code always answers the same
  status. `ok: false` is not part of an error body; the status says it.
- **An id that is none** — not a UUID where a route takes one — names
  nothing, so it answers what a missing one does (`not_found`, or the
  route's own code for what it names), never the 500 path. A node the caller
  may not read answers the same
  ([authorization.md](authorization.md#two-checks)).

One table, `src/lib/platform/apiErrors.ts`, maps each code to its status and
its message, and builds every body: `apiError(code, details)` for a request
an adapter refuses, `apiErrorFrom(e)` for a model's refusal — a `CodedError`
(`platform/codedError.ts`) under a code of the table; anything else goes on to
the 500 path, so a database's message never reaches a client — and
`apiForbidden` for a 403 that is also an `authz.denied` line. No adapter
writes an error body of its own; `apiErrorShape.test.ts` holds them to it.
The hook (`src/hooks.server.ts`) puts what SvelteKit answers itself under
`/api/` in the same body: a thrown `error()`, a path that matches no route
(`not_found`), a method without a handler (`method_not_allowed`), and an
unexpected error (`internal`, with the id). Its own refusals — no session
(`unauthorized`), too many requests (`rate_limited`) — are the same body, in
the language the request's cookie or browser asks for.

In the browser, `readApiError(res)` (`platform/readApiError.ts`) reads it
once into `{ code, message, …details }`; an answer without it — a network
failure, a proxy's page — is `network` or `unknown` with the generic
sentence.

A form action refuses with the same `error`, from the same table:
`formError(refusal)` (`platform/formError.server.ts`) answers
`fail(status, { error: { code, message, … } })` for a code of the table or a
model's `CodedError` under one, and sends anything else on to the 500 path.
Beside `error` an action may return what its form shows again, such as the
stylesheet compiler's `cssIssues`. A settings page shows `error.message`
through `SettingsPageHead`'s `error`. A refusal about single fields stays a
map from each field to its problem, which the page shows as that field's
error: Branding's colours (`colorErrors`), an integration's settings
(`problems`).

Left as they are:

- **The byte routes** — media, fonts, the site stylesheet, a document's
  content and a share's, a plugin's file proxy — answer people's browsers,
  which open their addresses: a status and the sentence alone, as text in
  the interface language (`textError`).
- `/api/graphql` keeps GraphQL's `errors` array, `/api/health` its probe
  status, `/api/csp-report` its empty answer.

A plugin's own routes answer with the same body, under codes of their own
and sentences from their dictionaries ([plugins.md](plugins.md#routes)). The
agents' server answers its own HTTP refusals the same way
([mcp.md](mcp.md)); a tool's error inside an MCP result is MCP's.

## Related pages

- [architecture/overview.md](overview.md) — the node model these routes dispatch over.
- [authorization.md](authorization.md) — the route-level public/private gate (`PUBLIC_ROUTES`), the visibility model, and the space access-level scope line, a separate concern from slug resolution itself.
