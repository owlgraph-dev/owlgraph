# Blocks

A page is a document of blocks: paragraphs and headings, cards and images,
containers that hold other blocks, and the query block that draws live
results. This page is the overview: what a block is, the names one block goes
by, and the marks inside its text. The rest of the model has a page each:

- [Block anatomy](anatomy.md) — the files a block kind is made of, one Svelte
  component drawing a block in the editor and on the page, adding a kind, the
  names that never change, and a block the running code does not know.
- [Capabilities](capabilities.md) — the styling data blocks share and how it
  cascades across screen sizes, the site's defaults, block spacing,
  background images and minimum height, and where each is edited.
- [Layout](layout.md) — the page's own settings, columns pages and their
  sections, grid and flex arrangements per screen size, placement, and why a
  selection stays in its cell.
- [Quick links and embedded nodes](node-embeds.md) — a quick link's targets
  and looks, and the blocks that show a collection or a document.

How blocks fit into the page as a whole is the
[architecture overview](../overview.md).

## Blocks: constrained taxonomy + escape hatch

Agents never write raw TipTap JSON or freeform HTML into storage. They
write a small, Zod-validated `BlockInput`
union (`src/lib/features/content/blocks/blockInputSchema.server.ts`) — heading, paragraph, callout, code, list,
table, quickLink, diagram, collection, document, grid, flex, section, a plugin's own
kinds ([plugins.md](../plugins.md#what-an-agent-may-author)) and a deliberately narrow `html` escape
hatch — which is mapped server-side to canonical TipTap nodes ([mcp.md](../mcp.md)); the
editor saves the document's own TipTap JSON. Either way `html` blocks
are sanitized on every write, and a link mark is stored as its checked href and
nothing else — the page's document and every version of it alike, a lost draft
kept as one included (see [authorization.md](../authorization.md) for where that
sits relative to permission checks, and `src/lib/features/content/render/sanitize.server.ts`
for the sanitization policy itself). Inside a query block's template an
`html` block declares its parameters as `{{{key}}}` / `{{{key:type}}}` tokens
— see [dynamic-rendering.md](../dynamic-rendering.md#parameters-in-html-blocks).

Each block kind's code lives in a folder of its own under
`src/lib/features/content/blocks/`, with its editing UI under
`src/lib/features/editor/blocks/` — see [Block anatomy](anatomy.md#block-anatomy).

There are two layout container kinds, both nestable inside each other's cells
and inside themselves: the **grid** (`grid/`) models fixed structured
cells — positions, merges, per-row height — for tabular/dashboard layouts;
the **flex container** (`flex/`) models content-driven flow —
direction, wrap, justify/align, gap — for content that should size to itself
and wrap, like a row of buttons. Leaf blocks may live at the page's top level
or nested inside either container's cells.

A third, the **page section** (`section/`), is the grid bound to
the page: a columns page's row, top level only, whose columns are the page's
column template rather than its own ([Page layout](layout.md#page-layout-sections)).

## The block name map

One block goes by several names, each fixed by what reads it: the **kind** an
agent writes (`append_block`, [mcp.md](../mcp.md)), the **node type** the
document stores, the **folder** its code lives in under
`src/lib/features/content/blocks/`, its **group** for the site's defaults
([Capability defaults](capabilities.md#capability-defaults)), the **island**
the page hydrates, if any, and the **label** the editor shows.

| Agent kind | Node type | Folder | Group | Island | Label |
|---|---|---|---|---|---|
| `paragraph` | `paragraph` | `paragraph/` | text | — | Paragraph |
| `heading` | `heading` | `heading/` | text | — | Heading |
| `callout` | `callout` | `callout/` | text | — | Callout |
| `code` | `codeBlock` | `code/` | text | — | Code block |
| `list` | `bulletList`, `orderedList`, `listItem` | `list/` | text | — | List, List item |
| — | `blockquote` | `quote/` | text | — | Quote |
| — | `horizontalRule` | `rule/` | text | — | Divider |
| — | `image` | `image/` | media | — | Image |
| `html` | `htmlBlock` | `html/` | media | — | HTML embed |
| `diagram` | `diagram` | `diagram/` | media | `diagram` | Diagram |
| `quickLink` | `quickLink` | `quickLink/` | cards | `quickLink` | Quick link |
| `collection` | `collectionBlock` | `collection/` | cards | — | Collection |
| `document` | `documentBlock` | `document/` | cards | — | Document |
| `table` | `table`, `tableRow`, `tableCell` | `table/` | containers | — | Table, Table cell |
| `grid` | `grid`, `gridCell` | `grid/` | containers | — | Grid, Cell |
| `section` | `pageSection`, with `gridCell` cells | `section/` | containers | — | Section |
| `flex` | `flexContainer`, `flexCell` | `flex/` | containers | — | Flex row, Flex cell |
| — | `queryBlock` | `query/` | containers | — | Live query |
| — | `placeholder` | `placeholder/` | text | — | — |
| — | `unknownBlock` | `unknown/` | text | — | Unknown block |

A dash under *Agent kind* is a kind agents cannot write. The placeholder and
the unknown block are the editor's own and never stored: the first holds an
empty cell's place, the second stands in for a node this build cannot read
([Unknown blocks](anatomy.md#unknown-blocks)). A plugin's kinds follow the
same scheme inside the plugin ([plugins.md](../plugins.md)). The node types,
the agent kinds and the block classes are [frozen](anatomy.md#frozen-identifiers).

## Inline marks

A run of text carries marks rather than blocks: the typography marks (family,
size — stored like the capability's, [typography.md](../typography.md) — colour,
weight, line height, letter spacing), `pageLink` / `docLink`,
`semanticProperty`, `customStyle` — an admin-defined named style
([custom-styles.md](../custom-styles.md)) — and `link`, a plain web link the API
writes, which the editor keeps but offers no way to make. A mark is
registered in the editor, or the text under it is an unknown unit
([Unknown blocks](anatomy.md#unknown-blocks)): its block is kept as it was, and shows
nowhere. A mark is rendered on the server by
`render.server.ts`'s `MARK_RENDER_ORDER` + `renderMarkWrap`, whose order fixes
the nesting (earlier is innermost, so a colour lands inside a link rather than
outside it). Bold is deliberately absent: `StarterKit.configure({ bold: false })`
retires it in favour of the typography weight mark.

A text colour therefore lives in one of two places — the block's Typography
(set with a caret) or a colour mark on a run (set on a selection) — and taking
it away does not depend on which one the selection points at: the block's
*Default* removes the block's colour and every colour mark inside the block,
and *Clear* on part of a coloured run removes the mark from the whole run. The
colour popover says when a block holds coloured text of its own. What the text
then takes is the default text its background gives it
([theming.md](../theming.md#scheme-regions)).

## Related pages

- [Block anatomy](anatomy.md), [Capabilities](capabilities.md),
  [Layout](layout.md) and [Quick links and embedded nodes](node-embeds.md) —
  the rest of the block model.
- [architecture/overview.md](../overview.md) — where blocks sit in the
  overall page model.
- [dynamic-rendering.md](../dynamic-rendering.md) — the query block.
- [authorization.md](../authorization.md) — permission checks around block
  writes.
- [design-system/overview.md](../design-system/overview.md) — the analogous token system for
  the app's chrome (not page content): related, but a separate concern.
