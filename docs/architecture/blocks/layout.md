# Layout

How a page and its containers arrange blocks: the settings of the page as a
whole, columns pages and their sections, a grid's columns and a flex row's
arrangement per screen size, where a block is and how it sits there, and why a
text selection stays in the cell it started in. The overview is
[Blocks](overview.md).

## Page settings

What an author sets on the page as a whole, rather than on a block, lives on
the **document root node's attrs** (`features/content/page/pageAttrs.ts`), side by
side:

| Attr | Holds | Auto |
| --- | --- | --- |
| `spacing` | the page's block rhythm ([Block spacing](capabilities.md#block-spacing)) | the site's page rhythm |
| `layout` | `{ mode?, template?, gap?, preset?, presetLabel?, sectionDefaults?, widths?: { desktop?: { read?, wide? } }, gutters?: { desktop?, tablet?, phone? } }` — the page's layout and where it came from ([Page layout](#page-layout-sections)), its own reading column, wide band and side margins | a flow; the site's width and gutter tokens |
| `surface` | `{ desktop?: { bg? } }` — the page's background | the content palette's ground |

Being part of the document is what makes them travel with it: a saved
version, a restore and a backup carry them verbatim, with no column of their
own. **Auto is nothing stored** here too: every normalizer drops what is
invalid or default, so a page that sets nothing carries nothing and renders
on the site's values.

**The canvas and its blocks container.** Every view of a page has the same
two elements: the canvas (`.page-canvas` — its ground, its outer cap, the
`canvas` query container and the page's own variables) and, inside it, the
blocks container (`.canvas-blocks`, whose children are the top-level
blocks). The editor has them as `.editor` around `.ProseMirror`; the public
page and a share link as `article.prose` around a `div`. They are separate
because an element cannot query its own container: every inset that changes
per breakpoint of the canvas — the gutter, the default top padding
(64 / 48 / 32 px, none under a bleed-to-top hero) — is the blocks
container's, where the canvas's tiers apply, in the editor's tablet and phone
previews as on a device.

**Widths.** The canvas's effective widths are its `--canvas-read`, `--canvas-wide`
and `--canvas-w` custom properties, which `app.css` points at the width tokens
([Capability defaults](capabilities.md#capability-defaults)). A page may override the
reading and the wide width for itself — a length in px or rem, bounded per
unit (`PAGE_WIDTH_BOUNDS`) — which lands on its canvas as the page's own
`--canvas-read` / `--canvas-wide`; the outer cap is the site's alone. A width is a
*cap* on a fluid column, so one value serves every viewport: 760 px is only
reached where the canvas is wider than that. A percentage is no unit here,
since it would scale instead of cap (60% is a wide column on a desktop and
a sliver on a phone); a stored one is converted to px against the built-in
canvas cap. A block's section width — normal / wide / full ("Read / Wide /
Full") — still says which of these it spans: every top-level block is capped
at the reading column, a `wide` section at the wide band (never narrower
than the reading column, `max(--canvas-read, --canvas-wide)`), and a `full` one spans
the canvas. Print ignores all three and fits the A4 column.

**Gutters.** The side margin between the canvas edge and its content, per
breakpoint: the site's tier tokens (`--content-gutter-d/-t/-p`, steps of the
gutter ladder, [Capability defaults](capabilities.md#capability-defaults)) unless the page
sets a tier of its own (`layout.gutters`, px or rem, `PAGE_GUTTER_BOUNDS`).
The blocks container pads itself with the current tier's gutter, so a
column's width is the smaller of its cap and the canvas less two gutters.
Each tier stands alone: a page tier it doesn't set is the site's gutter at
that tier, never the page's larger one, so a phone doesn't inherit a
desktop-sized margin. They are edited in the page's Spacing section, which
follows the breakpoint switcher.

**Full.** A `full` section spans the canvas edge to edge — out through the
gutter, so its surface bleeds — and its content is inset by the same gutter
by default (`--default-pad-x`, the side default the padding chain reads
before the group's), so text inside a band starts where the page's text
does on a narrow canvas. An author's own padding still wins; a query block
keeps its flush result container; print gives bands their group padding.

**Background.** One of the theme colours the content's own text, muted text
and links are checked against (`PAGE_GROUND_TOKENS`: background, subtle and
the soft tints) — never a literal or a brand colour, so the page follows every
colour scheme and nothing else on it has to change. It paints the canvas and
the whole reading area around it (`--page-bg`), and it is the ground the
scheme-region decision, the contrast guidance and the adaptive-readiness check start
from (`pageGrounds`, [theming.md](../theming.md#scheme-regions)). No radius or shadow:
a canvas that spans the reading area has no corners or edge.

**Layout mode.** `layout.mode` is the page's arrangement: `flow` — blocks one
after another — is the default and never stored; `columns` comes with the
column template its sections are bound to ([Page layout](#page-layout-sections)).

Widths and the background apply at every breakpoint and gutters are set
per breakpoint; the attrs are keyed by breakpoint like every capability bag,
so a per-breakpoint setting is a new key, not a new shape.

**Emission.** `pageCanvasOverrides` turns them into the canvas's override
set — only what the page sets — which the public page and a share link
register as a rule of the per-page stylesheet and the editor applies as its
canvas's style (the diff preview's blocks render on the site's values); `pageGroundOverrides` is the ground alone, the
rule the root layout puts on the reading area (`main`, named by the page
data's `groundRuleId`).

**Writes.** The editor serializes every attr the Document node declares, `{}`
for Auto, so a save tells "cleared" from "not mentioned". A doc built from a
block list (an MCP tool, a cherry-pick) has no root attrs, so each setting it
does not mention is carried over from the stored page (`pageAttrsForWrite`,
per key) rather than reset. The MCP tool `set_page_layout` changes them
without touching content, and `get_page` reports them.

**Versions.** Restoring a saved version writes that version's doc as a version
of its own — never folded into the restorer's last autosave, so the document it
replaced stays in the history and the restore can be undone. A
version saved before a page setting existed does not mention it — so the
setting is carried over like any unmentioned one: the page keeps its current
widths, background and gutters. That is deliberate: a restore brings back
content, and settings the version never had are not reset to Auto.

## Page layout: sections

A page is a **flow** (blocks one after another) or a **columns** page, whose
content is a sequence of **sections**: rows bound to a column template the
page declares. That is what an article with marginalia needs — an image
beside *its* paragraph — and what a phone needs to read it: paragraph, its
image, next paragraph.

**The template** (`features/content/page/pageColumns.ts`) is per breakpoint:
column proportions as whole-number ratios (`{ desktop: [3, 2], tablet: [3, 2],
phone: [1] }`), 1–4 columns, a smaller viewport never with more columns than
a larger one (phone ≤ tablet ≤ desktop). The gap between columns is a step per
breakpoint, desktop-first. An invalid template leaves the page a flow — a page
never renders broken.

**Page layouts are the site's registry**
(`page_layout_presets`; the pages feature's `pageLayoutPresets.ts`, stored by
`pageLayoutPresets.server.ts`),
edited in Settings → Appearance → Page layouts
(`page-layout:manage`). A page layout is **structure only**: a stable id (fixed
at creation, from its first name in the site default language), a name and a
description, its mode, its column template per breakpoint, the gap between
columns, and what a new section starts as (its span, bleed-to-top). Never a
look: widths, surfaces and colours stay Auto, so a page keeps following the
theme, and retuning the site's look is the block defaults' job, not a
layout's. The registry sits on the theme scope model (a site's rows now, a
namespace's later), in an order and each switchable. The seeded set is
general, named in English and German: *Standard* (the flow), *Two columns*
(Zwei Spalten), *Main and side column* (Haupt- und Nebenspalte, 2:1), *Three
columns* (Drei Spalten, two on a tablet) — their sections spanning the wide
band — and *Sections* (Abschnitte, one column of full-width bands); every
column layout stacks on a phone. *Standard* is protected: the layout every
page can fall back to, it can be renamed and moved but never switched off,
deleted or given columns. New layouts are column layouts; *Custom* is a
template of the page's own, no layout's.

**A layout's name and description are localized text**, like a schema label
([languages.md](../languages.md#schema-labels-are-localized-text)): one string per language
in `page_layout_presets.label` and `.description`, edited in every enabled
language in the settings dialog (the name needs the site default language,
the description is optional), with the gap indicator in the table. Every
reader resolves them for the request's interface language: the settings
table, the editor's Page layout picker, MCP's `list_page_layout_presets`
(`label` and `description`, and every translation as `labels` and
`descriptions`) and `get_page`'s `layoutLabel`. A name is unique within each
language. The layout's id is what identifies it; the editor's picker
receives the names in every language and resolves them itself, because a
page's record of the name is matched against all of them.

**Choosing a layout copies it** (`presetSnapshot`): the page stores the mode,
template, gap and section defaults as its own values, with the layout's id and
name — in the language it was chosen in, a plain string, since it is content —
as a record of where they came from (`preset`, `presetLabel`) — so its
cell counts always match what it stores, it renders without the registry, and
new sections start from the page's copy of the defaults. **A layout's later
edits never reach a page**: a changed column count would merge a page's
columns behind its author's back. The page shows instead that it has drifted:
its Page layout reads "customized" once its values and its layout's differ —
because the layout changed, or because the author adjusted the template on the
page, which keeps the record. *Apply the layout again* copies the layout's
values again, reconciling the sections like any change of column count and
saying what merged. A page resolves its record against the registry
(`resolvePageLayoutPreset`): the enabled layout of that id, else of that name
in any of its languages (a page from another site), else none — a deleted or switched-off layout
leaves the page *Custom*, its values intact.

**A section** (`pageSection`) is the grid container extended with `bound`: it
keeps the grid's cells (`gridCell`), placeholders, NodeView and renderer,
and leaves out everything that lets a container own its columns — column
widths, rows, its own gap, the width and row dividers, the cell merge. It has
as many cells as the template's desktop tier has columns. What it sets for
itself: its span (Read / Wide / Full, the [Page settings](#page-settings)
rules: a Full section bleeds to the canvas edge with its content inset by the
gutter), bleed-to-top, its spacing and surface, and **Columns: Template |
Single column** — a single column whatever the page has, for a title band.
Sections are top level only (the doc's content expression names them, a cell's
doesn't) and are blocks in the page's flow, so the page rhythm spaces them and
their cells relay a rhythm to their contents like any grid's.

**Rendering is CSS**: a columns page publishes its template on the canvas
(`--page-columns-cols-d/-t/-p`, `--page-columns-gap-*`, `--page-columns-flow`, through `pageCanvasOverrides`),
and `grid.css` gives `.grid.page-section` those tracks per breakpoint of
the canvas. Where a tier has fewer columns than the section has cells, the
cells wrap, and in a single column they stack in **document order** — main,
then aside — which is the phone's interleave, per section. A section on a flow
page (pasted, imported) has no template to read and renders as an
equal-column row. The editor's canvas carries the same variables, so a
template change restyles every section live.

**The document operations** (`features/content/page/pageSections.ts`) are plain
JSON in, JSON out, shared by the editor (applied as one transaction — one
undo step) and the server:

- *flow → columns* wraps every top-level block into one section, first cell;
- *columns → flow* unwraps the sections in order, cells concatenated; what
  a section held for itself (surface, spacing, span) goes with it;
- a different **desktop column count** reconciles every section: more
  columns append empty cells, fewer merge the trailing cells' blocks into the
  last cell that stays — nothing is lost, and the editor says what moved;
  proportions, gap or preset alone never touch content;
- *Single column* merges a section's cells into one, and back out to the
  template with empty cells;
- a block that is **not in a section** on a columns page (an agent's append,
  an import) is put into one, in the main cell — on every write
  (`persistDocTx`), on editor load, by the editor's guard after any change,
  and defensively by the renderer, so the page never breaks.

**Editing.** The page root's Layout section has the Page layout picker — the
site's enabled layouts in order, each with a thumbnail drawn from its template
(desktop, tablet, phone), and Custom; switching between a flow and a
columns layout asks first and names what happens — and on a columns page the
columns and their gap for the edited viewport (the same column controls the
settings' layout dialog shows per viewport). Editing them keeps the page's
record and marks it "customized", beside *Apply the layout again*. On a columns
page the page-end strip adds a section, the Insert menu offers *Section*,
and a selected section's block tools set its span and add one below it. The
selection chain reads Page › Section › Cell › …; a section's block settings panel has
its own section (span, Columns, bleed-to-top, and a way to the page's layout)
plus Spacing and Surface. A block in a section moves between cells and
sections by command ([Placement](#placement)). The phone editor navigates
sections; structure is the desktop editor's.

**Agents** list the site's layouts with `list_page_layout_presets`, set one
with `set_page_layout` (`layout`: a layout's id, `standard` or `custom`; passing
the page's own layout again re-applies it; `columns` and `columnGap` adjust
what the page has; its result reports merges), read it from `get_page`
(`layout`, `layoutLabel`, `layoutCustomized`), add rows with
`append_block` kind `section` (cells in column order, padded or merged to the
page's count, the page's default span unless given, refused on a flow page),
and fill or style a section with `set_cell` and `style_grid` like a grid.

## Grid columns per tier

A grid container's columns are its structure: `columnWidths` holds the
desktop's column weights, and their count is how its cells fill the grid,
row by row. A tablet and a phone may have columns of their own
(`blocks/grid/gridColumns.ts`):

| Attr | Holds | Auto |
|---|---|---|
| `columnsByTier` | `{ tablet?, phone? }` — whole-number proportions 1–12 per viewport | a tablet keeps the desktop's columns; a phone stacks the cells in one column |
| `gapByTier` | `{ tablet?, phone? }` — a gap step per viewport | the larger viewport's gap |

The page template's rules hold: a smaller viewport never has more columns
than a larger one (a stored tier with more is cut to the tier above), and a
tier stores only what differs from what it would be without it — so an
untouched grid carries nothing and renders by the Auto column above. Where a
viewport has fewer columns than the desktop, the cells flow into its columns
in document order (four figures in two columns are 2 × 2); merged cells and
row heights are drawn for the desktop's columns, so they hold only at a
viewport with the desktop's count — on a phone only when the phone has
columns of its own, since a phone without them stacks and resets them. The
grid marks the viewports where its cells reflow
(`data-reflow`), and `grid.css` resets them there.

**Rendering** is the page sections' mechanism: the override set publishes
`--cols` and `--gap-d` for the desktop and `--cols-t/-p`, `--gap-t/-p` only
for a viewport with its own value (registered non-inheriting, so a grid in a
grid's cell never takes the outer one's), and the stylesheet reads them per
breakpoint of the canvas — in the editor's previews as on a device.

**Editing.** The grid's Layout section follows the breakpoint switcher: on a
desktop its column weights and gap; on a tablet or a phone *Auto* — which
says what it resolves to — or *Custom*, which starts from the
tier above's columns (a tablet from two) and edits count and proportions
with the page's column template field, and the viewport's gap. The block
tools' gap edits the previewed viewport too. The column and row dividers
resize the desktop's columns and rows, so they show only where the grid is
drawn in those — not in a preview whose viewport has columns of its own.
Adding or removing a desktop column is structure (the block tools); removing
one cuts the smaller viewports to the new count.

**Agents** pass `columnsByTier` and `gapByTier` on
`append_block`'s layout kind and on `style_grid` (`'auto'` takes a
viewport back), and `get_page` reports each grid's resolved columns per
viewport.

## Flex arrangement per tier

A flex container's arrangement is its Layout capability's direction and
wrap, per viewport and sparse like every field: Auto is the larger
viewport's, so a row left alone stays a row on a phone (a new flex container
does not wrap). Four arrangements answer what the cells do when the row is
short of room (`capabilities/layout/layout.ts`):

| Arrangement | Direction · wrap | Short of room |
|---|---|---|
| In one row | `row` · `nowrap` | the cells get narrower — Auto and Fill cells down to their content's minimum, Fixed cells below their size |
| Stacked | `column` · `nowrap` | the cells stack |
| Wrap into lines | `row` · `wrap` | the row breaks into lines |
| Scroll sideways | `row` · `scroll` | the cells keep their size, and the row scrolls in a box of its own |

`scroll` is a wrap value of the model, not of CSS: the stylesheet gets
`nowrap`, and the container marks the viewports where it scrolls
(`data-scroll="d t p"`, like `data-column`). There `app.css` gives it
`overflow-x: auto` with proximity snapping, and its cells `flex-shrink: 0`,
each snapping at its start. A reversed row reads as its plain one; in a
column direction `scroll` has nothing to scroll and the cells stack. Like a
table's, the scroll box clips what reaches past it, such as a cell's shadow.

**Editing.** The flex Layout section opens with *Arrangement*, following the
breakpoint switcher: Auto — on a desktop the container's default, on a
tablet or a phone *Inherit*, the hint naming what it resolves to — or one of
the four, which sets the viewport's direction and wrap at once. The
*Direction* and *Wrap* rows below edit the same two fields one at a time,
and the block tools' wrap group offers *Scroll sideways* too. The query
block's result container shares the capability, so a row of results can
scroll sideways as well (its unset arrangement is a column, Stacked;
[dynamic-rendering.md](../dynamic-rendering.md#result-layout)).

**Agents** author a flex row with `append_block` kind `flex`
(`flex/input.server.ts`): its cells in order, each a list of leaf
blocks as a grid cell's is (an empty cell is stored empty, as the editor
stores one); `layout` per breakpoint under the stored field names, narrowed
to what the editor offers — `flexDirection` row or column, `flexWrap`
nowrap, wrap or scroll, `justifyContent`, `alignItems`, `gap`; per-cell
`cellStyles` with the cell's `flexItem` beside the capabilities a grid cell
takes; and the row's width, placement, spacing, surface, min-height and
bleed. The node is sparse, so what an agent leaves out stays Auto.
`get_page` lists a row's cells, and `update_block` replaces a row whole;
`set_cell` and `style_grid` stay the grid's and the section's.

## Placement

Where a block is and how it sits there are two different things, kept apart:
the first is document structure, changed by command; the second is data, a
capability.

**Where a block is** — which cell of which section holds it — moves by
command, never by an attribute. A block that sits directly in a section's
cell has these moves (`features/content/page/pageSections.ts`, applied by the
editor's `moveBlockInSections` as one transaction — one undo step):

- *Move to the previous / next column*: into the previous or next cell of
  the same section;
- *Move to the previous / next section*: into the same cell of the
  section before or after it — its last cell when it has fewer, as a
  Single column one does;
- *Move into a section of its own*: into a new single-column section right
  after its own, spanning what that one does — the way to a full-width image
  band in the middle of an article.

Every move appends the block to the **end** of its target cell (a section
aligns its cells at the top, so the end is the predictable place), drops
that cell's placeholder, and leaves a placeholder in a cell it empties; a
section it empties stays, for the author to remove. The block stays selected
where it lands. The moves are block tools on the canvas and the Move
row of the block settings panel's Placement section: a single-cell section shows no
column moves, and a move with nowhere to go (a section move at the page's
first or last section) is disabled and says why. They are the desktop
editor's; the phone editor navigates sections but doesn't restructure them.
Dragging a block between cells is the same kind of move: it drops before or
after the block under the pointer, over a cell's empty area at the end of
that cell, and a placeholder where it lands goes. Since a phone reads a
section's cells in document order, a moved block reads where it now is: a
note moved into the next section's aside follows that section's paragraph.

**How a boxed block sits in its column** is the Placement capability
(`capabilities/placement/`): `placement: { desktop?: { align? }, tablet?,
phone? }`, `align` one of start · center · end · stretch, desktop-first like
every capability. It is for boxed blocks — the grid and flex containers, the
HTML block, the query block (a node attr like its width, whatever its
format), the quick link and the image; a text block's alignment is its
typography's. A page section has none: its place on the page is its span.

- **Auto stores nothing**, and the block takes its column's full width.
- A box at start, centre or end is as wide as its content, never wider than
  its column, and moved by its inline margins; stretch gives it the column's
  full width, which is what Auto renders. A block that places nothing
  carries neither the `cap-placement` class nor a value.
- The margins are relative to the **column**. In a cell that is the cell; at
  the top level it is the reading column (or the wide band) inside the blocks
  container, so "end" on a flow page is the reading column's end, not the
  canvas's (`--placement-edge`, `app.css`). A full band has no column to sit in and
  keeps its width; the block settings panel leaves the row out.
- A **quick link**'s link fills its wrapper when stretched. Its Auto is
  wherever the cell's horizontal alignment puts it, so there is no one Auto
  value to name.
- An **image** has a width of its own (a percentage of its frame), so only
  its margins in the frame move: start · center · end, Auto the middle. An
  image with a stored one-value `align` (left / right) renders by it, and
  reads it as its desktop placement until the author places the image, which
  replaces `align`.

The emitter returns an override set — `--placement-w-*`, `--placement-ml-*`, `--placement-mr-*`,
plus a card's `--quick-link-fill-*`; an image's margins only — sparse against a CSS
chain whose fallbacks are Auto: a tier's value goes out only where it
differs from the tier above. The vars are registered non-inheriting, so a
placed container's values never reach a block inside it.

**Vertical alignment in a section's cells** is the cell's own Alignment
section, which a section's cells have like any grid's (the bound flag leaves
out only what owns columns). A section's row stretches its cells to the
tallest, so a cell's vertical *Middle* centres a marginal image against the
paragraph beside it; on a phone the cells stack and there is nothing to
centre against. With *Stretch content* on, the vertical setting positions a
stretched child's content (a card's label) rather than the child.

**A flex cell's place in its row** is the Flex cell capability
(`capabilities/flexItem/`), on the flex container's cells only — a flex item
ignores Placement's width-and-margins model, and a grid cell's size is its
container's columns:

- *Size*, along the container's direction. **Auto** is as large as its
  content and never wider than its row — the flex cell's default
  (`flex: 0 1 auto`, its content's minimum, `max-width: 100%`), nothing
  stored: where the row has no room it shrinks down to its longest word and
  its text wraps, instead of the row running past the page
  ([responsive.md](../responsive.md)). **Fill** shares the row's free space
  with the other filling cells by *Weight* 1–3 (`flex: <weight> 1 0%`; each
  cell keeps its padding, the space beyond it divides by weight), with its
  content as its minimum, so a row of filling cells wraps rather than
  squeezing text past its longest word. **Fixed** is a size of its own — px, rem or % of the row, bounded —
  (`flex: 0 1 <basis>`, never wider than the row): it wraps where the
  container wraps and yields where it doesn't, and never overflows. In a row
  it is the cell's width as well, because a row sized to its cells (one
  placed at start, centre or end) measures them by width, not by
  flex-basis; the container marks the breakpoints where it runs as a column
  (`data-column`), where it isn't.
- *Alignment*, across the container's direction: `align-self` start ·
  center · end · stretch; Auto follows the container's alignment.

Per breakpoint and sparse like every capability (`--flex-item-flex-*`,
`--flex-item-minw-*`, `--flex-item-maxw-*`, `--flex-item-w-*`, `--flex-item-self-*` over `flex.css`'s
fallbacks, which are the content-sized cell). A cell that sizes itself also
sets aside the editor's empty-cell floor, so it measures as on the page.

Agents set a placement on `append_block`'s quickLink, html, grid and flex
kinds (`placement`, grouped by breakpoint), and a flex cell's size and
alignment as its `cellStyles` entry's `flexItem`; moves are the editor's.

## Cell boundaries

A text selection stays in the cell it started in
(`blocks/shared/cellBoundaries.ts`). Cells and the containers around them —
flex and grid cells, a page section's cells, table cells and rows, the
containers themselves — are `isolating` nodes, which keeps commands such as
Backspace at a cell's start from crossing them; a selection replaced as a
whole is another matter. ProseMirror's replace joins the two open sides of
a selection, so a selection from one cell into the next, replaced by typing,
Delete, Enter, cut or paste, would make the two cells one — a grid with a
cell too few, a table row shorter than its header — and one from a cell out
past its container would pull the next block into the cell.

So the editor clamps every new text selection, the way prosemirror-tables
normalizes one across table cells:

- a head that **left the anchor's cell** stops at that cell's edge — a drag
  or Shift+Arrow from one cell into the next selects to the end of the first;
- a head that **entered a container from outside** — from a paragraph into a
  row, from a cell into a row nested in it — stops before the container, on
  the anchor's side;
- a selection that **covers a container whole** stays as it is: replacing it
  removes the container whole, and the text around it joins as it would
  around any block.

Node selections, select-all and the gap cursor are left alone. Every edit
reads the editor's selection, so the one rule covers typing, deleting,
Enter, cut, paste, drop and input methods alike.

**Select-all goes in two steps**, as in other block editors: the first
Ctrl+A selects the text block the caret is in — a paragraph, a heading, a
list item, a table cell, a code block — and the second, once that block is
selected whole (or when a block is selected as a node), the whole page.
Typing over everything takes a deliberate second press, and the whole page
stays one key away for copying it. There is no step for a whole cell in
between: a cell that starts or ends with a nested row has no text position
at its edge, so its selection would be clamped short. During a mouse drag Chrome
lets the browser's highlight run on and draws the clamped selection when the
button is released; other browsers clamp as the pointer moves.

The price is that text in two cells — or, on a columns page, in two sections
— cannot be selected or copied in one go; a whole row or grid can, from the
block before it to the block after.
