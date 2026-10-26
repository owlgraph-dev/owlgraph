# Quick links and embedded nodes

The blocks that point at other nodes: the quick link, a card that links to a
page, a document or an address, and the collection and document blocks,
which show the node itself on the page. The overview is [Blocks](overview.md).

## Quick link targets

A quick link points at one of three things, its
`refType`:

- **a page** or **a document** — by node id, so a renamed or moved target
  keeps its link, and the link is an edge of the knowledge graph;
- **an address** (`url`) — an external URL (`https://…`, `mailto:`), opened
  in a new tab, or a **path on this site** (`/search`,
  `/search?class=concept&view=grid`), opened in the same tab. A path reaches
  the app's own pages that are no nodes, and keeps whatever a URL can say
  about them, such as a filter.

`safeTargetHref` (`content/render/linkTarget.ts`) is the one gate for an
address: it lets `http(s)`, `mailto:` and a site path (`/…`, never `//host`)
through and turns anything else into `#`; a site path is what decides the
same tab, in the public renderer and the nav/footer alike. A path is stored as
written — the app's top-level routes are reserved words
([routing.md](../routing.md#reserved-word-policy)) and do not move under
content.

The link picker — the node picker ([search.md](../search.md#the-node-picker))
in the toolbar's popover and the phone's link sheet — finds pages and
documents by their title, opens on the ones the editor worked on last, and
makes a page it is asked for in the page's namespace. Choosing a card's
target, it also offers the site's own pages (`src/lib/features/editor/shared/sitePages.ts`,
the search page today; a new linkable route is one entry there), and turns a
typed address — a URL, a bare domain, a `/path` — into a "Link to …" row
(`linkTargetFromQuery`; `editor/shared/linkPickerRows.ts`).
Choosing a site page stores its path and labels the card in the page's
content language. The card's block settings panel edits an address in place, so a
filter can be added to a path after it is chosen.

## Quick link variants

The quick link's three looks are real variants, not
presets: a stored `variant` — `link` · `outlined` · `button`
(`blocks/quickLink/variants.ts`) — decides which Surface fields the
card carries at all. A link carries its corner radius only (for the hover
tint); an outline its border, radius and shadow; a button its background too.
The cards group's defaults and the card's own Surface values apply to those
fields and to nothing else: a cards default background reaches buttons, a
cards default border reaches outlines and buttons, and a link never paints
either. What a variant looks like when neither the theme nor the card says
more is its built-in look — an outline's `border-strong` hairline, a
button's accent fill with its readable text.

The variant is enforced in three places that cannot disagree: the emitter
emits only the variant's fields (`quickLinkSurface`, against
`quickLinkDefaults`); the variant class in `quickLink.css` supplies the
built-in look and pins the group defaults the variant must not take to
`initial`, above the theme's group rule; and the block settings panel offers only the
variant's fields (a link has no Surface section, and the underline is the
link's alone). Values stored for another variant's fields are pinned, not
deleted: switching back brings them with it. Scheme regions and contrast guidance
read the same filtered surface, and take a button's fill — its own, the
theme's or the built-in accent — as the ground its text sits on.

A card stored without a variant infers it from its surface: a background at
any breakpoint makes it a button, a border an outline. Agents pass
`variant` on a `quickLink` block (`append_block`); `surface` fine-tunes the
look's own fields.

## Collection and document blocks

A page embeds a node of its own kind of content with two blocks: the
**collection block** (`collectionBlock`, `blocks/collection/`) shows a
curated collection's members, and the **document block** (`documentBlock`,
`blocks/document/`) an uploaded or linked document. They are the deeper
embed; a quick link ([Quick link targets](#quick-link-targets))
stays the general link to a node. Both are cards (the `cards` group), with
spacing, surface, typography and placement, and both are drawn by the
content feature's shared listings — the members as the collection's own page
lists them (`EntryList`, the rows `memberRows` writes), the document as a row
or a card (`DocumentEntry`, [Shared listings](anatomy.md#shared-listings)).
A collection or document an integration keeps is shown by that integration's
own block ([plugins.md](../plugins.md)); the editor offers the kinds of each as
one family ([One family in the editor](#one-family-in-the-editor)).

| Block | Attrs | Unset |
|---|---|---|
| collection | `nodeId`; `limit` (1–200); `density` (`normal` · `compact`); `showLabels`; `columns` (`kind`) | 20 shown; normal; labels shown; the kind column |
| document | `nodeId`; `variant` (`row` · `card`); `titleMode` (`auto` · `node` · `filename`); `preview` (`auto` · `none`); `showMeta`; `showDownload`; `showNodeLink` | a row, titled by its file (a card by its node); a card's type tile; details and download shown; no link to the node |

**What a reader sees is what they may read.** Before a page renders, each
feature resolves its block for the page's reader (`resolveCollectionBlocks`
in the collections feature, `resolveDocumentBlocks` in the documents
feature, each one query for all of a page's blocks — the collection's
members in another — whatever their number), and the render reads what was
resolved (`RenderContext.blockData`). Never the author's view: whoever
embedded the node — a person, an agent — each reader sees what they may read.

- A collection: its members the reader may read, in its order, at most its
  `limit` of them, a member labelled in the collection going by its label
  (the page's content language), its own title below; a nested collection a
  row linking to it; and "All n entries" — the collection's own page — when
  there are more. Without a member the reader may read, its empty line.
- A document: an upload as its file — its type, size and day, one link to
  its content route (a PDF or a text opens in a tab of its own) and its
  download; a link as its host, never its address, opened beside the page
  with nothing sent along (`noopener noreferrer`) and nothing to download.
  An upload is never shown as an image: documents hold PDFs and texts.
- **A node the reader may not read renders nothing at all** — not its box,
  not its title: hidden is not protected, and a placeholder would say
  something is there. That holds for an anonymous reader, a share link's
  visitor (a link grants its page, not what the page embeds) and a reader
  outside a restricted namespace alike. A lookup that fails hides its blocks
  the same way.
- Where nothing was resolved at all — a version's preview — the block draws
  its box and a neutral line, as every addressable block draws its box.

Nothing of either is an island: their links are plain links. A page is found
by its own words only, never by what it embeds — the collection and the
document are found themselves ([search.md](../search.md)). Each declares its
node as a link (the `edges` facet), so the node's own page lists the page
under "Referenced by".

**In the editor** each block follows its node as the editor reads it
(`editor/core/embeds.ts`: one load per node, shared by every block and panel
showing it), through `GET /api/collections/<id>` and
`GET /api/documents/<id>` — the same answer a page resolves, the same 404 for
a node that is gone and one the editor may not read, which the block says in
a line only the editor sees. Its settings panel picks the node from those
the editor may read across namespaces — the node picker
([search.md](../search.md#the-node-picker)), on a phone a page of the block's
settings sheet; picking one an integration keeps turns the block into that
integration's block (below). The picker also makes the node it is asked for,
in the page's namespace: a curated collection at once ("New collection
“…”"), a document — an upload or a link — from its form. The Insert menu
offers both blocks at the head of their family's group.

**Agents** author both (`append_block`, `update_block`, `set_cell`, kinds
`collection` and `document`, [mcp.md](../mcp.md)): a node the agent may read,
refused otherwise; and `get_page` names an embedded node as the agent
reading the page may read it.

### One family in the editor

A collection or a document reaches a page through one of several kinds — the
core's for a node no integration keeps, a plugin's for the nodes it keeps
(the Nextcloud folder and file blocks, [plugins.md](../nextcloud.md))
— and the editor offers the kinds of each as one family:

- **Declared on the kind.** A kind that embeds a node says so in its catalogue
  row: `embeds: { family, nodeAttr }`, the family (`collection` or
  `document`) and the attr that holds the node — `nodeId` for the core's
  kinds, `collectionId` and `documentId` for the Nextcloud blocks. Whose nodes
  a kind shows follows from who adds it: the core's kind shows the nodes no
  integration keeps, a plugin's kind the plugin's own (`pluginOfBlockKind`),
  so nothing is declared twice.
- **The dispatch** (`blocks/embeds.ts`, `embedKindFor`): a node's family and
  its source — its plugin — name the one kind that shows it. The core's
  kind is always there, a plugin's while its plugin is turned on; the edit
  route loads which plugins are (`enabledPlugins`).
- **The Insert menu** lists each family under its heading: "Collection" — the
  curated collection, then each plugin's kind of the family — and
  "Document" — the file or link, then theirs. A plugin's kinds are there only
  while it is on; a plugin's kind of no family stays under "Integrations".
- **The picker** of a core block offers every node of its family the editor
  may read. Picking one no integration keeps sets the block's node; picking a
  plugin's node turns the block into the plugin's kind, the row saying which
  while it is highlighted ("As Nextcloud folder"). A node whose plugin is
  turned off, or whose source no kind shows, is listed but cannot be picked,
  its row saying why.
- **The swap keeps the block** (`replaceBlockKind`,
  `blocks/shared/blockOps.ts`): one transaction, its own undo step, the same
  `blockId` — its place, its overlay, every link to it — the picked node in
  the new kind's attr, and each capability the new kind takes (spacing,
  surface, typography, placement) carried over, so the box looks as it did,
  its `data-b` rules included. Nothing else carries: two kinds may give one
  name different meanings (a quick link's `variant` is not a document
  block's), so the new kind's display options start at its defaults. Undo
  turns the block back, its node and options as they were.

What each kind shows a reader who may not read its node is its own: the
core's kinds nothing at all, a plugin's kind what its plugin decides (the
Nextcloud blocks draw their box and a neutral line). And the core's block and
a plugin's block of one family keep display options of their own — a
collection block's density and a folder block's are two settings. Both are
accepted while one integration provides nodes; a second plugin is the
point to fold a family into one kind with sources.

### A quick link becomes a block

A quick link ([Quick link targets](#quick-link-targets)) to a
document the editor may read can become the block that shows the document
itself — "Embed as block", among the block's tools on the canvas and in its
block settings panel. The document's source names the kind, by the family's
dispatch: the document block for an upload or a link, a plugin's block for a
document the plugin keeps while the plugin is on; while it is off, the action
is there but disabled, saying why. A link to a page or an address offers
nothing of the kind: a collection or a page has no card of its own to become.

It is the same swap as the picker's (`embedQuickLink`,
`blocks/quickLink/embed.ts`, over `replaceBlockKind`): the same block id,
the document in the new kind's attr, the card's spacing, typography and
placement carried, and of its surface only what its variant draws
(`quickLinkSurface`) — an outlined card's border and corners, never the fill
a link variant hides. Its label, its look and its target's text stay
behind; Undo turns the block back into the card.
