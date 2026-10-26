# Dynamic rendering: query blocks, templates, GraphQL

Static blocks (see [blocks/overview.md](blocks/overview.md)) store their content directly.
This page covers the blocks whose content is computed at render time from a
stored *query* instead.

## Query blocks

A `queryBlock` node (`src/lib/features/query/queryBlockExec.server.ts`) stores a filter or a
graph traversal (see below) plus a query *template*: an authored content
subtree with placeholder values (reusing the existing semantic-attribute
mark mechanism — the mark's `attrName` is the binding key, the marked text is
the placeholder). At render time, `src/lib/features/content/template/templateBinding.ts` deep-clones
that subtree once per query result and substitutes each placeholder with the
matching field from that result — a pure data transform that runs *before*
the ordinary render walker, which stays unaware templating happened at all.
An optional per-key `mapping` can redirect a placeholder to a different
result field or apply a transform (`src/lib/features/content/template/templateTransforms.ts`); a key
with no mapping falls back to a direct field-name match. A `format` attr
names how results render — `'template'` today, a key into the small format
registry in `src/lib/features/content/blocks/query/formats.ts` rather than a hardcoded
value, so a future format (map/timeline/table) is a matter of registering
it, not a schema change.

### Result layout

A format owns its **result container** — the block's wrapper element that
holds the stamped instances on the public page and the single authoring
instance in the editor — and declares which capabilities that container
exposes; their data lives in the block's `formatOptions` attr, scoped to the
active format. The template format's container is a flex container reusing
the **Layout**, **Spacing** and **Surface** capabilities from
[blocks/overview.md](blocks/overview.md) verbatim: the same data model, CSS-variable emission,
`@container` cascade and block settings fields as the flex container, not a
query-specific control set. Each result is one plain flex child; the
container arranges them (direction, wrap, justify/align, gap), pads the
list and paints its background/border/radius/shadow, while everything
*inside* a result is the template's own concern. With nothing set, the
container flows as a column with no gap, padding or surface — a plain
stacked list. The container is described once — the block wrapper
(`blocks/query/view.ts`, [blocks/anatomy.md](blocks/anatomy.md#containers-without-chrome)) —
and drawn by the editor and the public renderer alike, its override set a
rule of the editor's live sheet as of the page's stylesheet, so the
arrangement previews live (the one authoring
instance behaves exactly as each result will, sizing to its content in row
direction). Set to scroll sideways at a viewport, a row of results scrolls in
its own box there, as a flex row does
([blocks/layout.md](blocks/layout.md#flex-arrangement-per-tier)).

Independently of the format, the block has the same placement attrs as the
layout containers: **section width** (normal reading column, wide, or full
canvas width — the site's widths or the page's own,
[blocks/layout.md](blocks/layout.md#page-settings)), mirrored as `data-width` on the
wrapper so the canvas's breakout rules apply to it, and **bleed to top**, which suppresses the
canvas's top padding when the block is the page's first top-level block.

### Template parameters

A template parameter is **not a property** — it only reuses the property
mark. The editor's "annotate" button is context-aware: inside a query block's
template it enters *parameter mode* and defines an abstract slot with a
**free local name** (not chosen from the property vocabulary) and a
**declared datatype**, stored as the same `semanticProperty` mark with
`propName = parameter:<name>` plus a `paramType` attr. In normal content the
same button annotates a real property (group + name).

`parameter` is a **reserved group** (`PARAMETER_GROUP` in
`src/lib/features/semantic/propertyGroups.ts`), reserved in code only: there is deliberately
no `property_groups` row for it. Nothing references the group by foreign key
— parameters never create property definitions and never reach
`node_properties` (`collectProperties` stops at the query-block boundary and
skips parameter-group marks anywhere) — so never creating the row is what
keeps it out of every group listing and picker, and the server refuses to
create a group, definition or manual property in that namespace. A bound
parameter renders as plain text on the public page, never as a
`data-prop` span: the slot is not a claim about the embedding page.

The declared type is a **contract**, not a value type (no value exists until
a result is bound). The query builder's mapping uses it two ways: it drives
which transforms are offered for that parameter (even before anything is
bound), and it is compared with the bound source's type — a mismatch is
**warned but allowed**, since a transform never throws and the author may
know better. Comparison is at transform-category level (`text`/`longtext`
are one contract; intrinsic sources only have a category); an ad-hoc
property with no definition has no known type and raises no warning.
Template marks from before the parameter group existed (`core:<name>`, no
type) keep binding unchanged — a key with no declared type falls back to the
source-derived transform set — and migrate to the lightweight form simply by
re-applying the annotation, which rewrites the key.

#### Parameters in HTML blocks

An HTML embed block inside the template has no marks, so it declares a
parameter as a token in its stored html: `{{{key}}}` or `{{{key:type}}}`.
The triple braces are the parameter marker, so the token needs no sentinel
group; like the mark it carries a **name** and an optional **declared type**
(the same datatype identifiers as `paramType`). The type suffix is recognized
only when the segment after the *last* colon is a datatype identifier,
because a key can itself be a namespaced property name: `{{{title}}}` and
`{{{core:status}}}` are untyped keys, `{{{when:date}}}` is the key `when`
typed `date`, and `{{{core:status:date}}}` is the key `core:status` typed
`date`. An untyped token declares no type (not `text`): it raises no mismatch
warning and offers transforms from whatever source it is bound to, exactly
like a legacy mark. The one corner is a property whose local name equals a
datatype identifier (`{{{core:date}}}` reads as key `core` typed `date`);
the mapping shows the parsed name and type, so it is visible and can be
redirected there.

A token's binding key is the raw key as written, so `{{{title}}}`
direct-matches the intrinsic title and `{{{core:status}}}` the property, and
a mapping entry for that key redirects or transforms it. A mark parameter
`parameter:x` and a token `{{{x}}}` are therefore two different keys (the
token direct-matches a field `x`, the mark never does); the mapping marks
token-declared rows with an HTML origin so both can be told apart. One
grammar (`src/lib/features/content/template/templateParams.ts`) is shared by the renderer's
substitution and the query builder's detection, so the mapping always lists
exactly what render will substitute. At render time the bound value is
HTML-escaped as it is substituted (a value is literal text, never live
markup) and the block's html is then sanitized as usual —
substitute-then-sanitize, so a value can never smuggle markup or a
`javascript:` URL past the sanitizer. This token is unrelated to the
rich-text `{{{name:value}}}` write syntax of the MCP/block-input path, where
the colon separates a property's name from its *value* and the text is
parsed into a mark on write; that syntax never reaches an HTML block's
stored html.

The filter is stored in **GraphQL wire format**
(`src/lib/features/query/nodeFilter.ts`'s `WireNodeFilter`/`WireOrderByInput`) —
the same shape the editor's query-builder UI and the GraphQL API use —
translated into a direct call against `getNodes()`
(`src/lib/features/query/graphql/nodes.server.ts`) at execution time.

### Authoring: the query builder

The block's modal (`src/lib/features/query/components/`) is built on two
ideas. **One source picker** answers "what am I referring to?" everywhere:
a grouped picker — Fields (the intrinsic fields) / Properties (semantic
properties) / Tags / Class / Relationships (relationship types) — chooses a
condition's subject, the sort key (fields and properties) and a template
parameter's mapping source (the binding keys and properties, plus
"automatic" for the direct name match). A condition is one uniform row —
source, operator, value, remove — whose operator list and value control
follow the chosen source: a text or date input, a closed picker for
type/namespace/creator, the class picker with its subclass toggle, a chip
input with autocomplete for tags, and, for a relationship, the direction as
the operator with an optional edge-property condition on a second line.

A mapping source's Fields are the node's intrinsic **binding keys**
(`title`, `url`, `slug`, `createdAt`, `updatedAt`, `type`, `namespace`,
`creator`, `class`, `externalUrl`, `locale`), available on every result whatever
properties it carries, with a real property of the same name taking
precedence. `url` is always the node's own page; `externalUrl` is a link
document's external address ([documents.md](documents.md)) and empty for
every other node, so a literature list can link straight to the cited work
while the node stays the citation point. The
reference-valued ones bind a **display name, never an id**: `namespace` the
namespace name, `creator` the creator's name (empty for system-created
content), `class` the class label (a class label is localized text, resolved
by its fallback chain — [languages.md](languages.md)). `locale` binds the result's
content language as its code (`de`, `en`) — for a `lang` attribute or a
language badge. Every node carries a class, at least its node type, so
`class` is never empty: a page with no domain class binds its type class's
label ("Page" / "Seite" as seeded, or whatever an admin renamed it to). Each
key has a fixed transform category — dates for `createdAt`/`updatedAt`, url
for `url`/`externalUrl`, text for `title`/`slug`/`class` (so a class chip can
take case and truncate transforms), and reference (universal transforms only)
for `type`/`namespace`/`creator`/`locale`. The label is resolved in the
result query itself (a join on `node_classes`), so it covers exactly the
nodes the viewer may already read.

A query block's output is part of the page's content, so it renders in the
**page's content language**, not the reader's interface language: the class
label, a date or number formatted by a transform, the yes/no words, the
empty-state text ([languages.md](languages.md#rendered-in-the-content-language)). An
English page shows "March 15" and "Page" to a reader whose interface is
German, matching the content's `lang`.

**Conditions live in condition groups** whose header carries the AND/OR
combinator. The draft model is a tree (`conditionRows.ts`'s
`ConditionGroupDraft`), loaded losslessly from the stored filter and edited
immutably, and the group editor is recursive, so a nested and/or authored
through GraphQL or MCP loads and edits as nested groups; only the affordance
to *create* a nested group is not offered yet. The same editor serves the
root filter, a traversal's start filter and a step's target filter.
Traversal steps are their own sub-area: one compact line per step —
relationship type, direction, repeat count — with the step's edge-property
condition ("Edge filter", a single condition, since an edge condition holds
one) and target filter ("Target filter", a nested group) behind collapsed
links. The start (the current page, or nodes by filter) is a segmented
control that appears once a step exists. The template format's parameter
mapping sits under the Format section; the result container's layout is
edited in the block settings panel with the block selected, not in the modal.

## Why execution happens before the render walker

`renderDoc` (`src/lib/features/content/render/render.server.ts`) is a deliberately **synchronous**
walker. Query execution is async (it hits the database), so it can't happen
inline during the walk. Instead, the reader's render (`renderPage`, in the
reader feature) runs a pre-scan step that
resolves every query block on the page into a plain `blockId ->
result` lookup map *before* calling `renderDoc`, which then just reads from
that map. This is the same "resolve async data outside the walker" pattern
already used for page-link href resolution (`linkSlugMap`).

## Viewer-scoping

Query execution runs under the **current viewer's** permissions, exactly
like any other read — see [authorization.md](authorization.md). A query
block never returns pages/documents the viewer couldn't otherwise read,
regardless of who authored the query.

## The GraphQL API

`src/lib/features/query/graphql/` (the shared Pothos builder in
`builder.server.ts`, the query root plus the filter/traversal grammar in
`schema.server.ts`, node resolution in `nodes.server.ts`; the semantic
catalogues and the `search` field are contributed by those features'
`graphql.server.ts` adapters — full-text search itself lives in the search
feature's `search.server.ts`, pagination bounds in `src/lib/platform/pagination.ts`), served via graphql-yoga, is the query surface query
blocks/templates are built on and that the editor's query-builder UI calls
directly. It's also used for the MCP `search` tool. GraphiQL is available
locally when `ENABLE_GRAPHIQL` is set (see `.env.example`).

A `NodeFilter` leaf is a semantic-property condition, a typed-edge (`edge`)
condition, an **intrinsic** condition on a column of the node itself
(`slug`, `title`, `createdAt`, `updatedAt`, `type`, `namespaceId`,
`createdBy`, `classId`, `locale` — the language the node's content is in,
`EQ`/`NEQ`/`IN` over language codes — and a link document's `externalUrl`),
or a **tag** condition. An intrinsic sort names one of these fields; an
unknown name is refused as bad input. `externalUrl` is the one intrinsic field that can be absent (null
on a page and on an uploaded document), so it alone takes `EXISTS` /
`NOT_EXISTS` — "is a link document" — besides `EQ`, `NEQ`, `CONTAINS` and
`STARTS_WITH`; `NEQ` counts a node without an address as different. The class condition selects
nodes by their explicit class (every node has one, at least its node type —
`type` is that class's node-type ancestor), polymorphically by default — a
class and its subclasses — with `classMatch: EXACT` as the opt-out; the
operators are described in
[semantic-layer.md](semantic-layer.md#querying-by-class). The tag condition
is a set predicate over a node's tags (many per node, uncontrolled
vocabulary): `HAS` one tag (`value`), or `HAS_ANY` / `HAS_ALL` / `HAS_NONE`
of a list (`values`); tags are matched case-insensitively, the same way the
tag editor de-duplicates them, and the SQL is a per-node correlated lookup
on `node_tags` (see [semantic-layer.md](semantic-layer.md#querying-by-tag)).
The `propertyDefinitions`, `relationshipTypes`, `nodeClasses` and `tags`
queries expose the catalogues a client needs to build these conditions.

A result `ContentNode` carries the same intrinsic fields as ids
(`namespaceId`, `createdBy`, `classId`) plus `locale`, its content language,
`className`, the class's display name in the request's interface language
([languages.md](languages.md#api-channels)), and — for a page — `contentScheme`, the colour scheme its content
renders in ([theming.md](theming.md#content-scheme)), and `externalUrl`, a
link document's external address (null otherwise; `url` stays the node's own
page). The name sits beside the id because the `nodeClasses` catalogue that
would resolve it is restricted to schema readers, while a node's own class
name is visible to anyone who can read the node.

The `nodes` query's `id` is a node id (see
[architecture/overview.md](overview.md#the-node-model)). Properties and tags are
stored node-generically (`node_properties`, `node_tags`, FK'd to `nodes`),
and documents carry both, but this query — and so a query block's flat
filter — is page-scoped: the list query below runs it over pages only, so a
filter written for pages never starts listing documents. Documents are
reached through `traverse` below, whose walk and hydration are node-generic —
a literature list is a traversal from a page to the documents it cites — and
through the search page, which runs the list query over every node type. The `/graph` view and each page's local-graph
sidebar are a separate, non-GraphQL read path (`getGraph`/`getLocalGraph` in
`src/lib/features/graph/graph.server.ts`) over the same `nodes` + `edges` tables.

## The list query

One SQL statement lists nodes by a filter
(`src/lib/features/query/filterSql.server.ts`, `findNodesByFilter`), and
every flat list in the app is it:

- **Scope.** Pages only for the GraphQL `nodes` query and query blocks
  (`findPagesByFilter`); every node type for the search page
  ([search.md](search.md)). The statement reads `nodes`, left-joining pages
  and documents; the page scope is "has a pages row".
- **The filter** is compiled against the node row (`filterFragment` with
  alias `n` — the alias is required, never defaulted, so a leftover page
  alias cannot silently drop documents). No filter lists everything the
  viewer may read.
- **A full-text term** (optional) narrows to the pages and documents whose
  search vector matches, each table probed through its own index, and gives
  each row a rank and an excerpt — the search overlay's matching, from the
  search feature's `ftsSql.server.ts`, so both views find the same things
  ([languages.md](languages.md#search)). The excerpt is computed for the returned rows
  only.
- **Order.** A field, a property, relevance to the term, or most recently
  updated first; ties always break by `updated_at` and then the node id, so
  equal timestamps still have one order and a page of results fetched by
  offset neither skips nor repeats a row.
- **Visibility** is ANDed outside the filter and the term, exactly as in
  every read path, and **the total** (`countNodesByFilter`) is the same FROM
  and WHERE counted — after the visibility predicate, so a count never
  includes a node the viewer cannot read.

`listNodes` (`graphql/nodes.server.ts`) is its entry point for a paged list
with a total: it takes the filter and the sort in the **wire format** a query
block stores (`queryDefinition.ts`), runs the same validation `getNodes`
does — shape caps, operators per datatype, existing relationship types — and
returns the page of rows with the total. A stored definition can therefore
feed it unchanged.

## Graph traversal

The `nodes(filter:)` query above answers "which nodes match these
conditions," including a single-hop typed-edge condition (`filter.link`).
**Traversal** answers a different question: starting from a node (or a set
found by a filter), walk typed edges outward — multiple hops,
direction-aware, filtered per hop — and return the reachable node set. It's
the `traverse(query:)` GraphQL query (`src/lib/features/query/graphql/traverse.server.ts`),
reusing the same `EdgeCondition`/`NodeFilter` shapes per step rather than a
parallel filter model (`src/lib/features/query/traversal.ts`, `src/lib/features/query/traversal.server.ts`).

A `TraversalQuery` is a **start** (explicit node ids, or a `NodeFilter`
producing the start set) plus an ordered list of **steps**. Each step is an
edge condition (relationship type + direction + optional edge-property
condition — the same `EdgeCondition` a single-hop filter uses) with an
optional target-node filter and a `repeat` count (default 1).

**`repeat` is a cumulative reachable set, not "exactly N hops away."** A
step with `repeat: N` authz-checks and edge-matches candidates at every hop
1..N, always continuing to walk from every candidate found regardless of
any target filter (so a filter never blocks reaching a node further out
through a non-matching intermediate — e.g. "a manager up to 3 levels up who
is the CEO" correctly walks through non-CEO managers). The step's *output*
— what becomes the traversal's final result, or what the next step starts
from — is the union of every candidate found at any hop that also passes
the target filter (or every candidate, if there's no filter), deduplicated.
For `repeat: 1` (the common case: a fixed sequence of different edge types,
one step per hop) this collapses to exactly the single-hop mental model.

**Every hop enforces the viewer's permissions — prune-and-hide, not
filter-then-check.** A node the viewer can't read is excluded from a hop's
candidates before it can be walked through or returned — silently, with no
signal (row count, error, timing) distinguishing "pruned by authz" from "no
such edge." A hidden intermediate therefore breaks the path even if the
node beyond it is independently visible to the viewer: the connection
*through* something hidden isn't something the viewer can see, only the
disconnected fact that the far node exists (if reachable some other way).

**Hard bounds**, enforced before and during the walk
(`src/lib/features/query/traversal.ts`): a max number of steps, a max `repeat` per
step, a max total depth (sum of every step's `repeat`), a max candidate
count per hop, and a max accumulated result size per step. A global
`visited` set spans the whole traversal (not just one step), which is what
makes a cyclic edge type safe — no recursive cycle-detection needed, since
a hop simply can't revisit an already-visited node.

Execution is plain TypeScript iterating one hop at a time (`runOneHop` in
`src/lib/features/query/traversal.server.ts`), not a recursive SQL query — every hop, at
any step or repeat, runs through the exact same authz-checked function, so
there's no code path that could skip the permission check. Results feed the
same `ContentNode` type and format/template pipeline as `nodes(filter:)`
(node-generic — a traversal can reach pages or documents, unlike `nodes`,
which stays page-scoped for its own separate reason above).

A `queryBlock` can hold a traversal instead of a flat filter (mutually
exclusive `filter`/`traversal` attrs), with a `fromCurrentPage` flag that
anchors the start at the embedding page — resolved to an explicit start id
in `queryBlockExec.server.ts`, never a magic id in the GraphQL schema itself. This
is what lets a page self-assemble content from its position in the graph
(e.g. a Topic page rendering "key authors on this topic" by walking `about`
inbound to Books, then `authored` inbound to People).

Not offered: path-sequence and subgraph results (and their formats),
aggregation or grouping over traversal results, and external or federated
sources. The model is source- and node-type-agnostic throughout, so none of
them would rework the traversal or its authorization.

## Related pages

- [blocks/overview.md](blocks/overview.md) — the `queryBlock` block definition.
- [authorization.md](authorization.md) — the viewer-scoping guarantee.
- [architecture/overview.md](overview.md) — where render-time execution sits overall.
- [search.md](search.md) — the search page: the list query browsed through a URL.
