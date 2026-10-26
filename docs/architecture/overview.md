# Architecture overview

This is the orientation page — what the pieces are and how they fit
together. For specific subsystems, see the other `/docs` pages linked
throughout.

## Stack

SvelteKit (Svelte 5, runes) on top of a single Postgres database. Content
editing uses TipTap (ProseMirror) in the browser. Two write paths exist —
the browser editor and an MCP server (`src/mcp/server.ts`) for LLM agents —
and both call the same shared backend module, the pages feature's
`pages.server.ts`. A GraphQL API (Pothos schema under
`src/lib/features/query/graphql/`, served via graphql-yoga) sits alongside the more direct `/api/pages` REST-ish routes,
and is also what powers query blocks and search (see
[dynamic-rendering.md](dynamic-rendering.md)).

## Hydration comment nodes

Every SSR'd page's DOM tree — visible in view-source and in devtools —
contains HTML comment nodes like `<!--[-->`/`<!--]-->` (block boundaries),
`<!--[0-->`/`<!--[-1-->` (branch/keyed markers for `{#if}`/`{#each}`),
`<!---->` (empty-node anchors), and `<!--$s1-->`-style markers (Bits UI's own
boundaries). These are Svelte 5's compiler-generated hydration anchors, not
debug output or a bug: the client runtime uses them to locate and reactively
bind the correct DOM region during hydration without re-parsing. Every
`{#if}`/`{#each}`/`{#key}`/`{#snippet}` block, and every Bits UI component
wrapped via the `child`-snippet pattern (see
[design-system/primitives.md](design-system/primitives.md#styling-bits-ui-wrapper-primitives)),
contributes its own anchors — so components with heavier control flow (e.g.
`NavigationMenu.svelte`, `AccountMenu.svelte`) produce visibly more of them.
They carry no visible content and don't affect the accessibility tree, SEO
crawling, or layout; they can't be removed without breaking hydration or
opting a route out of SSR entirely (no route in this app does).

## The node model

Pages, documents and collections are **specializations of a common `nodes`
identity**: `nodes` holds what's genuinely shared across content types — id,
**class** (`class_id`, required; see [semantic-layer.md](semantic-layer.md)),
the **type** (`page`/`document`/`collection`) derived from that class, namespace + slug,
visibility, the **content language** (`locale`, see [languages.md](languages.md#content-language)),
`created_by` and timestamps (`src/lib/features/nodes/nodes.server.ts`) — while
`pages`, `documents` and `collections` hold their type-specific columns
(`doc`; the document's source — an uploaded file's `bytes`/`mime`/`sha256` or
a link's `external_url`, see [documents.md](documents.md); a collection's
`plugin` and `source_ref`, see [semantic-layer.md](semantic-layer.md#collections))
keyed by the same id (each row shares its primary key with its node row). A
node's class sits somewhere in one hierarchy
`node → page | document | collection → domain classes`; its type is the node
type that class descends from, cached on the row (and held consistent by a
foreign key) so routing stays one lookup. Every node belongs to exactly one
**namespace** (`namespace_id`, required — see
[routing.md](routing.md#namespaces)); identity is `(namespace_id, slug)`,
unique per namespace rather than globally, and resolvable with a single
lookup. IDs are plain, unprefixed UUIDs; telling the types apart is always
done via the sibling `type` field, never via id shape —
the `/[[namespace]]/[slug]` route resolves a namespace + slug to a node and
dispatches on that field.

Every reference between content — the `quickLink` block, inline `pageLink`/
`docLink` marks — resolves to a row in one unified **`edges`** table of
`source_id -> target_id` node edges, regenerated from a page's content on
every save (`syncEdges` in the graph feature's `graph.server.ts`, called from
the page persist transaction; see
[dynamic-rendering.md](dynamic-rendering.md) for how the knowledge graph and
the incoming edges read it back out). This is the foundation a future typed
relationship model (edge type + properties) extends, not something built yet.

## The page-as-document model

A page's content is **one TipTap (ProseMirror) document, stored as JSONB**
— not a table of block rows. Top-level nodes in that document are "blocks";
each carries a stable `blockId` attribute so the editor UI, the MCP tools,
and the public renderer can all address the same block consistently even as
the document is edited around it. See [blocks/overview.md](blocks/overview.md) for the block
taxonomy itself.

## Editor vs. public render — and why they must match

> Decision: [0011. One Svelte component draws a block everywhere](../adr/0011-one-svelte-component-draws-a-block-everywhere.md).

Content renders through two independent code paths:

- **Editor**: TipTap NodeViews next to each block's definition under
  `src/lib/features/content/blocks/` render it interactively inside the
  browser editor (the editor feature mounts them). A leaf block may be drawn
  by one Svelte component in both places — mounted as its NodeView, rendered
  to the string by the public walker, hydrated on the page as an island
  ([blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)).
- **Public render**: `src/lib/features/content/render/render.server.ts` walks the
  same stored JSON, dispatching each node to the renderer its block folder
  registers (`blocks/renderers.ts`, one per block kind — see
  [blocks/overview.md](blocks/overview.md)),
  and renders it to a plain HTML string — deliberately a small hand-written
  walker rather than a generic TipTap-to-HTML helper, because some block
  types (e.g. the html block) keep their content in an attribute rather than
  in ProseMirror-managed content. A page reaches it through one function,
  the reader feature's `renderPage(page, reader)`
  (`src/lib/features/reader/renderPage.server.ts`), which the read route, a
  share link and the MCP `get_page_html` tool all call: it resolves
  everything that depends on who reads the page — the targets of its links,
  its query blocks, the collections and documents it embeds, its plugin
  blocks' data, the images' copies, the frame's rules in the per-page
  stylesheet — and then hands the walker its precomputed maps. From the
  route to the HTML, a public page is four files: its `+page.server.ts` (one
  line), `reader/routes/read.server.ts` (which node, and whether this viewer
  may read it), `renderPage.server.ts` and the walker.

Because these are two separate implementations of "how a block looks,"
**a change to how a block renders must be made in both places** — this is
the "editor/public parity" rule from `AGENTS.md`. Drift between them means
what an editor sees while writing doesn't match what a reader sees.

A related but distinct split lives entirely on the editor side: desktop and
phone are two chrome shells sharing one editing core, not a second render
path — see [editor.md](editor.md).

## Code layout: features, platform, shell

> Decision: [0005. Code is organised by feature, with checked boundaries](../adr/0005-code-is-organised-by-feature-with-checked-boundaries.md).

`src/lib` is organized **vertically by feature**, not by layer. Everything a
feature owns — its server modules, DTO types, typed API client, Svelte
components, SvelteKit adapters, unit tests and e2e specs — lives in one
folder under `src/lib/features/<feature>/`:

| Feature | Owns |
|---|---|
| `auth` | sessions/tokens, users, the role check (`can`), the `requireAction` route guard |
| `nodes` | the shared node identity (slugs, namespaces join, `readableNodes`), per-node access (`NodeAccess`, `canReadNode`/`canWriteNode`), share links, `nodePath` |
| `namespaces` | namespace CRUD, membership, the client-side slug registry |
| `content` | the page as a document, in folders named for what they hold: `doc/` (the stored document — `JsonDoc`/`JsonNode`, the attrs every block shares, asset references), `blocks/` (every block kind, one folder each, and the per-audience lists — catalogue, Tiptap extensions, renderers, islands, `BlockInput` → node building), `capabilities/` (the capabilities and the cascade, typography tokens and fonts), `page/` (the page's own settings: widths, ground, columns, sections), `color/` (content schemes, theme colour references, scheme regions, contrast and readiness), `render/` (the public render walker, sanitization, the link policies), `inline/` (the inline marks), `template/` (query templates) |
| `pages` | the page entity, doc persistence, block operations, locks, versions, the page diff, the page layout presets (the library a page's layout is copied from, its storage, its editing fields) |
| `documents` | documents and their sources (uploaded files, external links, an integration's files), serving, text extraction |
| `collections` | the collection node type: an ordered set of nodes, its members joined by `contains` edges that carry their position and label, a curated collection's members API (nesting guarded against loops), its page's body, `get_collection` |
| `editor` | the desktop/phone editor shells, `EditorCore`, editor chrome, each block's settings (`blocks/`) and each capability's edit fields (`capabilities/`), the shared `NodeMeta` prop contract |
| `semantic` | properties (values + schema), tags, node classes, the relationship-type catalogue |
| `query` | node filters, traversal, the GraphQL schema, query-block execution, the filter → SQL compiler, the query builder UI |
| `graph` | the `edges` table (sync + reads), edge properties, a node's relationships grouped for its header, the graph views |
| `search` | full-text search, search text extraction, the search overlay, the node picker |
| `media` | image assets, avatars |
| `site` | nav tree, footer, branding, the home page |
| `pluginHost` | the host the plugins' server halves run against, the dispatcher of their routes under `/api/plugins/<id>/`, their settings sections, the data their blocks need before a page renders, grants, and the content and connect routes of the nodes an integration's source backs ([plugins.md](plugins.md#the-server-half)) |
| `reader` | what a reader is shown of a node: its page at its address (the read route), through a share link (the share routes), and the node's header; `renderPage`, the one render of a page for its reader — a visitor, a share link's holder or an agent |

Two things are shared and are **not** features: `src/lib/platform/`
(db pool, migrations runner, rate limiting, settings kv, pagination bounds,
HTML escaping, the secret box, the outbound request client, served-file
headers, the site's languages and their names, the style policy — plain
infrastructure, imported by direct path) and `src/lib/design-system/` (the
Bits UI-based primitives, see [design-system/overview.md](design-system/overview.md)).

Above every feature sits the shell (`src/lib/shell/`), the app's frame: the
app bar and its Create dialog, the root layout's load, the settings frame,
the app's own pages under `/-/` and the sign-in gate's list. It composes
features through their entry points (and their public-route declarations),
and only `src/routes/` and `src/hooks.server.ts` import it, so a piece a
feature needs is never the shell's — it belongs to the feature that owns it,
to the platform if it is not UI, or to the design system if it knows no
domain.

`src/lib/plugins/` is outside the feature tree on purpose: a plugin
(`src/lib/plugins/<id>/`) extends the core through the contract in
`src/lib/plugins/api.ts`, and the core reaches it only through the registry
files beside that contract — one per audience, one line per plugin — which the
core's own lists read; a plugin's server half imports no feature and runs
against the host the `pluginHost` feature hands it ([plugins.md](plugins.md)).

### Entry points and boundary rules

A feature is imported **only through its entry points**, never by deep path:

- `$lib/features/<f>` (`index.ts`) — plain TypeScript: types, pure helpers,
  stores, typed API clients. Loadable in the browser, on the server and under
  Node tooling (the MCP server, Vitest, scripts) alike.
- `$lib/features/<f>/components` (`components.ts`) — Svelte components.
- `$lib/features/<f>/server` (`server.ts`) — the server-only modules
  (`*.server.ts`, which SvelteKit refuses to bundle into client code).
- `$lib/features/<f>/editor` (`editor.ts`) — the Tiptap node and mark
  definitions and the operations on them. They are plain TypeScript too, but
  they reach `@tiptap` and through it ProseMirror — hundreds of kilobytes
  that every importer of `index.ts` would otherwise carry, including the root
  layout and therefore every reader. `index.ts` is what the layout, the public renderer
  and Node tooling import, so anything Tiptap-shaped belongs here instead, and
  only the editor feature imports it. `check-boundaries` enforces both halves:
  a deep import is refused, and an `index.ts` whose closure reaches `@tiptap`
  is reported.
- `$lib/features/content/listing` (`listing.ts`) — the content feature's one
  further entry: its **shared listings**, Svelte components that draw
  content alike in any block or view that shows it, a plugin's included
  ([blocks/anatomy.md](blocks/anatomy.md#shared-listings)). It is client-safe like
  `index.ts` and imports no stylesheet: the public renderer loads these
  components under the Node loader too.
- `$lib/features/search/picker` (`picker.ts`) and
  `$lib/features/documents/create` (`create.ts`) — one further entry each,
  for a surface only some pages show: the node picker
  ([search.md](search.md#the-node-picker)), with which the editor, the
  semantic schema and the site's settings choose a node, and a new
  document's form, which the Create dialog and the picker's "New document"
  step share. The search barrels are on every page (the root layout imports
  the search overlay) and `documents/components.ts` is the reader's surface,
  so neither carries them. Both are client-safe like `index.ts`.
- The feature's **adapters** — the modules that bind it to one channel, each
  importable only from that channel (Svelte components included: a modal that
  only a settings page opens is an adapter, and keeps the feature's internals
  encapsulated instead of widening `index.ts`):
  - `routes/*.server.ts` — the SvelteKit adapters (load functions, form
    actions, request handlers), the only feature files allowed to import
    `@sveltejs/kit`; every `+page.server.ts`/`+server.ts` under `src/routes`
    is a one-line re-export that binds a URL to one of these. Next to them,
    `routes/publicRoutes.ts` declares which of the feature's route ids are
    reachable without a session; the sign-in gate composes those
    declarations (`src/lib/shell/publicRoutes.ts`).
  - `mcp.server.ts` — the feature's MCP tools, registered against the host
    contract in `src/mcp/registry.ts` and composed by `src/mcp/server.ts`.
  - `graphql.server.ts` — the feature's GraphQL types and query fields on the
    shared Pothos builder (`query/graphql/builder.server.ts`), composed in a
    fixed order by the query feature's `graphql/schema.server.ts`, which
    owns the query root and the filter/traversal grammar.

  Adding a feature's tools, GraphQL fields or public routes is therefore one
  adapter plus one line at the composition point; nothing else in the
  surface changes.

The server graph is **layered and acyclic** — `auth` → `nodes` →
`namespaces` → `semantic`/`content`/`media` → `pages`/`documents`/
`collections`/`graph`/`search`/`query` → `editor`/`site` → `pluginHost` →
`reader`, with the shell above all of them — a feature never imports a higher
layer, and no two features import each other's server code. The client graph only has
to be acyclic. DTO types a client needs from a server module live in the
feature's `types.ts`, so client code never reaches into `*.server.ts` at all.
The one exception is a route adapter component, which types its data from its
own load (`import type`, erased before anything is bundled), as the editor's
`routes/EditPage.svelte` does: a hand-written copy would drift from the load.
An entry point serves **one audience**. A feature that has both a reader
view and an editing or admin view does not put both in `components.ts`: what
only exists while editing belongs to the `editor` feature (that is where
`DocumentEditor` lives, not in `documents`), and what only a settings page
renders is a route adapter, not part of the feature's component surface. The
reason is mechanical, not stylistic: a Svelte component imports its own CSS,
so a barrel's unused exports cannot be tree-shaken, and one reader importing
one component drags the whole barrel into every page that renders it.

Barrels aggregate cheap modules only: anything with a heavy or optional
dependency (jsdom, pdfjs) is imported by direct path. A heavy dependency a
*client* barrel would otherwise carry is reached through a dynamic `import()`
instead, so it becomes its own chunk: a package that is not side-effect-free
(postcss) cannot be tree-shaken out of a chunk that merely might use it, and
one eager import from a component in a barrel puts it on every page that
imports anything from that barrel — the root layout imports several. The plugin
seam has rules of its own — only the registry imports a plugin, a plugin
imports the core through an allowlist, the core never names a plugin, no module
cycle runs through a registry ([plugins.md](plugins.md#boundaries)) — and the
shell sits above the features: an import of it from anywhere but the routes,
the hooks and the shell itself is refused. All of this is checked
statically by `scripts/check-boundaries.mjs`, which `npm run check` runs; the
MCP server's import closure is additionally kept free of `@sveltejs/kit` and
`$app/*`, because it runs under `tsx` outside the SvelteKit build, of
jsdom, which only the logo upload needs (`site/logoUpload.server.ts`, outside
the site barrel), and of stylesheet imports, which only Vite can load — a
component the public renderer draws gets its CSS from the stylesheet that
imports it (`content/blocks/blocks.css`); a violation names the import chain
that reaches it. The
public renderer in that closure does hold Svelte components — the blocks a
component draws ([blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)) — and every
entry point outside Vite loads them through one Node loader hook
(`scripts/lib/svelte-hooks.mjs`: the Svelte compiler, server output — the
components, and the modules with runes of their own, `*.svelte.js` and
`*.svelte.ts`, that a block's design-system controls bring with them), which
the MCP server's command, the scripts that render pages and the Playwright
config register; the unit tests compile them with the Svelte Vite plugin.

Tests are co-located: `*.test.ts` next to the module they cover, and
`features/<f>/e2e/*.spec.ts` for the feature's Playwright specs (the shared
harness stays in `tests/e2e/`; see [testing.md](../guides/testing.md)).

## Orientation: `src/routes/`

Route files are thin: they bind URLs to feature adapters (above) and keep no
logic of their own.

- `[[namespace]]/[slug]/` — unified content read (page, document or
  collection, dispatched by node type; namespace segment optional, absent =
  default namespace; a collection's page under the node header, see
  [semantic-layer.md](semantic-layer.md#a-nodes-page)) and `.../edit` — the
  browser editor. See [routing.md](routing.md).
- `graph/` — the knowledge-graph view (see [graph-view.md](graph-view.md)).
- `search/` — the search page, the query system browsed through a URL (see
  [search.md](search.md)).
- `settings/` — Settings, scoped by permission (see
  [settings.md](settings.md)): personal profile and API tokens, site
  settings, namespaces, the semantic schema catalogues under `settings/schema/`,
  user management, each integration's section (`settings/integrations/<id>`)
  and a person's own connections (`settings/connections`); its layout is the
  sidebar shell from `src/lib/shell/settings/`.
- `api/` — three kinds of segment, and a new one picks the kind it belongs
  to: **entity collections** with id-scoped sub-resources (`/api/pages`,
  `/api/documents`, `/api/collections`, `/api/media`, `/api/namespaces`,
  `/api/relationship-types`); **asset namespaces**, named after what they
  serve rather than what reads it, delivering bytes rather than JSON
  (`/api/media/fonts/[id]`, `/api/styles/site/[hash]`, `/api/embed/mermaid`,
  the Mermaid render frame — see the Content Security Policy section below);
  and **services** that take no entity (`/api/graphql`, `/api/node-search`,
  `/api/search-count`,
  `/api/health`, `/api/csp-report`, `/api/connections/<plugin>`, a person's
  own connection to an integration's service). `/api/plugins/<id>/…` is
  the plugins' own space: one catch-all route, behind which each plugin
  declares its routes ([plugins.md](plugins.md#routes)).
- `login/`, `logout/` — session auth.
- `-/` — the app's own pages, for everyone who uses the site: `-/about`
  (which owlgraph runs here, its licence and the source code of this version,
  [deployment.md](../guides/deployment.md#source-code-for-network-users)) and `-/license` (the
  licence as text). `-` can never be a slug (slugs are trimmed of hyphens at
  their ends), so a page added here never shadows a page of the site — unlike
  a new top-level word, which has to be reserved and takes that address from
  every site.

## Content Security Policy

> Decisions: [0007. Styles reach a page through a per-page stylesheet](../adr/0007-styles-reach-a-page-through-a-per-page-stylesheet.md); [0008. Diagrams draw in a same-origin frame](../adr/0008-diagrams-draw-in-a-same-origin-frame.md).

The base header comes from `kit.csp` in `svelte.config.js` (mode `auto`, so
SvelteKit nonces its own hydration script); `src/hooks.server.ts` then decides
the **style** half per response through `src/lib/platform/csp.ts`, with the
route classes by route id beside it in `src/lib/platform/cspRoutes.ts`:

- **strict** — every route not listed below: the pages, share links, home,
  login, error pages. `style-src 'self' 'nonce-…'`: no inline style
  attribute anywhere, and every inline `<style>` carries the response's nonce
  (`locals.styleNonce`, threaded through the root layout's data and read in
  the browser through `styleNonceFor`, which keeps the document's own nonce
  across re-runs of the layout load). Per-block overrides, the page canvas's
  variables and the few shell values that come from data are rules of a
  per-page stylesheet ([blocks/capabilities.md](blocks/capabilities.md#override-sets-and-the-carrier)).
  A short list of style attributes is allowed by hash (`'unsafe-hashes'` plus
  the sha256 of each fixed text, `HASHED_STYLE_ATTRIBUTES` in
  `platform/csp.ts`): the visually-hidden style SvelteKit's client router
  writes on its route announcer, and the `display: contents` bits-ui puts on
  every Command item wrapper, which the search overlay renders on every route.
  Both are fixed strings a dependency writes into markup the app does not
  control, so no nonce can reach them; both are the counterpart of the
  event-replay hash in `script-src`. A unit test recomputes each hash from its
  string and greps the installed dependency for it, so an upgrade that changes
  one fails there rather than in a browser. Adding an entry is a last resort —
  anything the app itself renders goes through the per-page stylesheet.
- **loose** — `/[[namespace]]/[slug]/edit`, `/settings/**`, `/dev/**`:
  authenticated tools whose libraries still write style attributes (Tiptap
  NodeViews, the settings previews, the playground). `'unsafe-inline'`, and
  no nonce beside it — a nonce in the same directive would switch it off.
- **frame** — `/api/embed/mermaid`, the Mermaid render frame: loose, and framable
  by this origin only ([theming.md](theming.md#content-scheme), "Diagrams").

Only HTML documents get this style half. Served bytes carry a policy of their
own, which the hook leaves as it is:
- **text documents:** `default-src 'none'; sandbox` (`documents/serve.server.ts`);
- **SVG images:** the same, plus `style-src 'unsafe-inline'` for their own
  styles (`media/media.server.ts`).

These keep anything a browser might read as markup inert on the app's origin.

**Phases.** `STYLE_SRC_PHASE` in `platform/csp.ts` is `report-only` or
`enforce`. Report-only keeps `'unsafe-inline'` enforced on strict routes and
sends the strict policy as `Content-Security-Policy-Report-Only`, with
violations posted to `/api/csp-report` (one log line each, rate-limited);
enforce sends the strict policy alone. It is a constant, not an environment
variable, so a deployment cannot quietly un-enforce it; flipping it is a code
change, gated on the lane below.

**A policy belongs to the document, not the route.** A client-side navigation
keeps the first response's header, so a link from a strict route into a loose
one — a page's Edit action, the account menu's settings entries, the login
form's redirect — is a full navigation (`data-sveltekit-reload`, or
`window.location.assign` where code navigates; `crossesStylePolicy` decides
for a computed URL), and the app bar's links perform full navigations while
on a loose route. Otherwise the editor would run under the reader's policy,
or a reader page under the editor's. The root layout keeps the rule for every
other way out as well: a link or a `goto()` within the app that crosses the
policy is cancelled and made again as a full navigation (`beforeNavigate`,
`src/routes/+layout.svelte`). That covers a lock gate's read-only view, a
discarded draft, a deleted node and a settings table's link to a page.

**Development.** Under `vite dev` SvelteKit relaxes `style-src` to
`'unsafe-inline'` and removes every nonce (Vite injects styles through
JavaScript), so the strict policy exists only in the built app — which is
what the e2e suite runs against ([testing.md](../guides/testing.md)). Every e2e test
fails on a violation its page reports, so each spec checks the policy on the
routes it visits. The CSP spec (`shell/e2e/csp-style-src.spec.ts`) adds, for
the strict routes: the header, zero style attributes in the served markup, the
cascade, a page left usable by every overlay, and the full-navigation rule.

**Writing UI for a strict route.** No `style` attribute, and no `style:`
directive whose value exists during SSR (Svelte renders it as an attribute).
A static value is a class; a value known only in the browser is a `style:`
directive that is `undefined` on the server; a value from data goes through a
`StyleCollector` rule (`data-b`). In scripts, set properties through the
CSSOM (`el.style.setProperty`), never `setAttribute('style', …)`. `check-ui`'s
`inline-style` rule flags a new attribute; the loose routes' remaining ones
are in its baseline.

## Related pages

- [request-lifecycle.md](request-lifecycle.md) — one request for a page,
  from the hook to the browser, step by step.
- [routing.md](routing.md) — the `/[[namespace]]/[slug]` resolver, namespaces, slug uniqueness, and the reserved-word/`/api` conventions.
- [editor.md](editor.md) — the editor's folders, its core and edit session, and the desktop/phone shared-core, forked-chrome split.
- [blocks/overview.md](blocks/overview.md) — the block & capability model.
- [documents.md](documents.md) — documents, their sources (upload or link), serving and search.
- [semantic-layer.md](semantic-layer.md) — properties, relationships, classes.
- [design-system/overview.md](design-system/overview.md) — the Bits UI-based component
  library and token vocabulary for app chrome.
- [custom-styles.md](custom-styles.md) — admin-defined styling for content:
  the named-style registry, the free-CSS escape hatch, and the compiler that
  confines both to the content area.
- [authorization.md](authorization.md) — who can read/write what.
- [settings.md](settings.md) — Settings: per-section permissions, the sidebar shell, the settings-row pattern.
- [dynamic-rendering.md](dynamic-rendering.md) — query blocks, templates, GraphQL.
- [graph-view.md](graph-view.md) — the shared graph component: layout engines and view modes, labels, focus, filters, colouring.
- [search.md](search.md) — the search overlay and the search page: the URL contract, what a viewer sees, the result cards.
- [migrations.md](migrations.md), [deployment.md](../guides/deployment.md), [backup.md](../guides/backup.md) — data and deployment.
