# MCP

owlgraph's agents work through an MCP server (`src/mcp/server.ts`, its own
process: `npm run mcp`, the compose stack's `mcp` service) over Streamable
HTTP. Every request carries a bearer token — an API token a person made in
the app — and the server acts as that token's user: each tool is gated by the
user's role, and a page- or document-scoped tool by the node's visibility, the
same checks the app makes ([authorization.md](authorization.md#enforcement-in-practice)).
An agent reads and writes exactly what its user may, nothing else; what it
reads of another service is the record the app keeps of it, never the service
live ([authorization.md](authorization.md#reading-another-service-as-the-viewer)).
A page, document or collection its user may not read answers exactly as one
that does not exist ("Page not found"), as the app's routes answer 404 — an
agent learns nothing of what it may not see, not even that it is there — and a
list of links leaves such a node out. Only a refusal by role ("Forbidden: your
role … cannot …"), or of a write to a node it may read, says why. The
server's own HTTP refusals — no token or one that names nobody
(`token_required`, 401), too many requests (`rate_limited`, 429), a body
over 100 KB (`too_large`, 413) or not JSON (`invalid_json`, 400), an
unexpected failure (`internal`, 500) — are the app's error body
([routing.md](routing.md#errors)).

The 100 KB holds any tool call. The body is held whole and parsed before the
token is read, so bytes an agent uploads take a route of their own rather than
a larger limit.

The server's information names its version and, as `websiteUrl` and in its
description, where the source code of the running version is
([deployment.md](../guides/deployment.md#source-code-for-network-users)).

## The tools

Each feature registers its own tools in its MCP adapter (`mcp.server.ts`),
and `src/mcp/server.ts` composes them; the full set is the one
`src/mcp/mcp.int.test.ts` pins.

| Feature | Tools |
|---|---|
| pages | `list_pages`, `create_page`, `get_page`, `get_page_html`, `append_block`, `update_block`, `delete_block`, `move_block`, `set_cell`, `style_grid`, `set_page_layout`, `set_page_locale`, `set_page_content_scheme` |
| graph | `get_edges`, `get_incoming_edges`, `get_relationships`, `traverse` |
| semantic | `get_node_properties`, `get_node_tags`, `set_node_tags`, `list_tags`, `list_property_names`, `list_property_definitions`, `find_pages_by_property`, `find_pages_by_tag`, `schema` |
| search | `search` |
| documents | `list_documents`, `get_document`, `get_document_text`, `create_document_link` ([documents.md](documents.md#mcp)) |
| collections | `get_collection` ([semantic-layer.md](semantic-layer.md#collections)) |
| query | `graphql` ([dynamic-rendering.md](dynamic-rendering.md)) |
| site | `list_paragraph_styles`, `list_custom_styles`, `list_brand_colors`, `list_page_layout_presets` |

## The tools' schemas

A tool's arguments are a zod shape, which the SDK hands an agent as JSON
Schema (draft-07) in `tools/list`. zod writes a shape out in full wherever it
is used, so a shape a tool uses more than once carries an `id`
(`.meta({ id })`): the schema names it once, under `definitions`, and refers to
it. The capability shapes have one (`content/capabilities/inputShapes.server.ts`),
and so do the cell style and the union of leaf blocks
(`content/blocks/blockInputSchema.server.ts`), which the union of all blocks
takes as one member rather than repeating its blocks. A description given
where a shape is used stays at that use. Without the ids, `append_block`'s
schema alone would be about ten times as long; `src/mcp/mcp.int.test.ts` fails
when a part of a schema of 1 KB or more repeats.

An id names one shape: two shapes with the same id in one tool's schema make
`tools/list` fail. An id an agent passes is checked as `z.guid()` — any
8-4-4-4-12 hex, as Postgres reads a `uuid` — not as `z.uuid()`, which also
wants an RFC version.

## Writing a page

An agent never writes TipTap JSON or free HTML. It writes **typed blocks** —
the `BlockInput` union (`content/blocks/blockInputSchema.server.ts`), checked
by zod at the tool's boundary and mapped to the page's nodes on the server
([blocks/overview.md](blocks/overview.md#blocks-constrained-taxonomy--escape-hatch)):

- `append_block` adds one at the end of a page (on a columns page a block
  that is not a section goes into one of its own), `update_block` replaces a
  top-level block by id — keeping the id — and `set_cell` fills or styles one
  cell of a grid or a section. `move_block` and `delete_block` work on any
  top-level block.
- The kinds: `heading`, `paragraph`, `callout`, `code`, `list`, `table`,
  `quickLink`, `diagram`, `html` (sanitized on every write), `collection`,
  `document`, and the containers `grid`, `flex` and `section`, whose cells
  take every kind but a container. A plugin adds kinds of its own — the
  Nextcloud plugin `nextcloud-folder` and `nextcloud-file` — which every one of
  these tools takes where it takes the core's
  ([plugins.md](plugins.md#what-an-agent-may-author)).
- A field left out stays Auto: the site's block defaults and the paragraph
  style decide, as for a block made in the editor.
- `append_block`'s description is the agent's manual: each kind, each style
  field, how a page with columns is written — and each plugin's paragraph
  after the core's.

**Linking to a node.** A link in a run of text (`[[pageId|label]]`,
`[[doc:id|label]]`) and a quick link name their target by id, and the target
is read as the agent writing. One its user may not read is as one that does
not exist: the link in the text stays the text it was, the quick link is
refused as not found, and neither takes the node's title
([authorization.md](authorization.md#what-a-link-shows)).

**Embedding a node.** `collection {nodeId, …}` embeds a curated collection's
members and `document {nodeId, …}` an uploaded or linked document
([blocks/node-embeds.md](blocks/node-embeds.md#collection-and-document-blocks)). The node is read as
the agent writing: a node its user may not read is refused as not found, and
one an integration keeps is refused with the kind that shows it. A plugin's
kinds are read through the plugin's host as the agent, and refused while the
plugin is turned off. What an agent embeds, every reader of the page then sees
as they may read it — a collection or document a reader may not read renders
nothing at all for them, whoever embedded it
([authorization.md](authorization.md#what-a-page-embeds)). Where the editor
turns a quick link into the block that shows its document
([blocks/node-embeds.md](blocks/node-embeds.md#a-quick-link-becomes-a-block)), an agent writes the
block itself with `update_block` over the quick link's id: the same id, the
kind it names.

## Reading a page

- `get_page` gives the page's title, content language, colour scheme, its own
  settings, and its blocks: each top-level block's id, its stored `type` and
  its `kind` — the name `append_block` takes, or null for a block an agent
  cannot write — a one-line preview, and a container's cells under
  `cellContents`. An embedded collection
  or document is named as the agent asking may read it —
  `collection "Reading list" · 12 entries`, `document "Minutes" · minutes.txt`,
  or `collection (not readable)`. A block this server can't read — a removed
  plugin's, a newer build's ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)) — is
  `unknown block (<type>)` with `unknown: true`, and nothing of what it holds;
  delete, replace or move a top-level one by its id like any block — one
  stored without an id has none to address, and is reached through the
  block that holds it, or in the editor. A change
  that would remove one some other way — deleting or replacing the block
  that holds it, `set_cell` replacing a cell with it — is refused and
  changes nothing; the refusal names each such block by its key and type,
  and `update_block`, `delete_block` and `set_cell` take those keys back in
  `acknowledgeDropped` to remove them on purpose
  ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)).
- `get_page_html` renders the page through the reader's render (`renderPage`,
  the one the page's address and a share link use), as an agent: its query
  blocks run and its embedded collections and documents are resolved as the
  agent's user may read them, the per-block stylesheet first. A plugin's
  block shows what it shows when nothing was resolved: an agent reads no
  service live. The page is drawn without its frame (no canvas or ground
  rules) and its images without their copies. An unknown block renders
  nothing, as on the page.

## Related pages

- [blocks/overview.md](blocks/overview.md) — the block taxonomy and what each kind holds.
- [authorization.md](authorization.md) — the checks every tool makes.
- [plugins.md](plugins.md) — a plugin's blocks and its inputs.
- [logging.md](logging.md) — what a tool call logs.
