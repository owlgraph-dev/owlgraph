# Capabilities

How blocks are styled: as typed data — capabilities — grouped by screen size
and resolved down a cascade, never as raw CSS. This page covers the
capabilities and their cascade, the site's defaults and how values are
emitted, the space between blocks, background images and minimum height, and
where each capability is edited. The overview is [Blocks](overview.md).

## The capability/cascade system

Visual styling (typography, spacing, surface/background) is modeled as
**capabilities** — typed data grouped by breakpoint, not raw CSS:

- `src/lib/features/content/capabilities/typography/` — font family (from a curated stack,
  not a raw CSS font string), size (a type-scale step or a px literal,
  [typography.md](../typography.md)), colour, weight, line height, letter spacing.
- `src/lib/features/content/capabilities/spacing/` — padding per side, plus
  the two inter-block fields: a flow's `blockSpace` rhythm and a block's own
  `spaceAbove` (see [Block spacing](#block-spacing) below).
- `src/lib/features/content/capabilities/surface/` — background (a colour,
  and on containers, sections and cells an image over it — [Background
  images](#background-images)), border, radius, shadow.
- `src/lib/features/content/capabilities/height/` — a container's or
  section's minimum height ([Min-height](#min-height)).
- `src/lib/features/content/capabilities/layout/` — flex container arrangement: display,
  direction, wrap (or scroll sideways — [Flex arrangement per
  tier](layout.md#flex-arrangement-per-tier)), justify/align content and
  items, gap. Consumed by the
  flex container (`flex/`) and by the query block's result container
  (see [dynamic-rendering.md](../dynamic-rendering.md#result-layout)); the
  grid container's columns and gap are attrs of its own, per viewport
  ([Grid columns per tier](layout.md#grid-columns-per-tier)), its row heights
  and merged cells the desktop's. A host whose unset defaults differ from the capability's
  own (the result container flows as a column, not a row) pins them as a
  rule in its own stylesheet and declares them for the block settings panel's hints —
  a kind pin, [Capability defaults](#capability-defaults).
- `src/lib/features/content/capabilities/placement/` — how a boxed block
  sits in its column: start, center, end or stretch ([Placement](layout.md#placement)).
- `src/lib/features/content/capabilities/flexItem/` — a flex cell's size in
  its row (Auto, Fill by weight, Fixed) and its alignment across it
  ([Placement](layout.md#placement)).

Each capability's data is grouped **capability-major**: breakpoint nested
inside the capability (`{ desktop: {...}, tablet: {...}, phone: {...} }`),
not the other way around. `src/lib/features/content/capabilities/cascade.ts` resolves a
requested breakpoint via a **field-level shallow merge down the cascade**
(desktop → tablet → phone) — so setting only `phone.size` overrides just
that one field at that breakpoint, without having to re-specify the rest of
the typography bag. This sparse-override model is what lets both the editor
UI and MCP tools set a single responsive property without clobbering
everything else at that breakpoint.

What the breakpoints are, and how each block fits a narrow canvas without
anything scrolling sideways — text that breaks, a table that scrolls in its
block instead of squeezing, a flex cell that never outgrows its row, a grid
that stacks on a phone — is [responsive.md](../responsive.md).

## Capability defaults

> Decision: [0004. NULL means inherit](../../adr/0004-null-means-inherit.md).

Every capability field resolves through the same three layers, and the
layers are the whole contract:

1. **The theme default** — the site-wide value a field takes when a block
   sets none ("Block defaults", Settings → Branding). It is set per
   capability × **block-type group**, never per block, and only as a step or
   a theme colour, never a literal, so it adapts to the colour scheme by
   construction. The theme stylesheet emits it once as CSS
   (`capabilities/defaults/emitDefaults.ts`).
2. **The block's own value** — stored and emitted only when an author set it,
   and only where it differs from what the chain already gives.
3. **Auto** — nothing stored, nothing emitted. An absent key in the data and
   an absent custom property on the element: the CSS falls through to the
   theme default. The block settings panel shows what that resolves to ("Auto · 8 px")
   and stores a value only on an explicit pick; the Auto segment clears it.

Explicit stays explicit: a stored value equal to the default is kept (the
author pinned it) and simply not emitted while the default equals it; move the
default and the pinned value re-emits.

Block defaults also holds the page's **gutters** ("Page margins") — one step
of the gutter ladder (0 / 16 / 24 / 40 px, `GUTTER_PRESETS`) per breakpoint,
built-in L / M / S for desktop / tablet / phone — emitted as the tier tokens
`--content-gutter-d/-t/-p`, and its **canvas widths** — the reading column,
the wide band and the canvas's outer cap — as one px value each rather than
a step, since a width is not a choice on a ladder. They are tokens
(`--content-width-read`, `-wide`, `-max`): `app.css` declares the built-ins
(760 / 1200 / 1800 px, `BUILTIN_WIDTHS` in `capabilities/defaults/tokens.ts`,
held identical by a unit test), and the theme stylesheet re-declares only
the ones the admin moved. How a page uses and overrides them is
[Page settings](layout.md#page-settings).

### Groups

Every block kind declares its group in `blocks/catalog.ts` (`group`, a
required field — a kind without one does not compile):

| Group | Kinds |
|---|---|
| `text` | paragraph, heading, codeBlock, callout, bulletList, orderedList, listItem, blockquote, horizontalRule, placeholder |
| `containers` | grid, gridCell, pageSection, flexContainer, flexCell, table, tableRow, tableCell, queryBlock (its result container) |
| `media` | image, htmlBlock, diagram |
| `cards` | quickLink, collectionBlock, documentBlock |

Both renderers put the group's class (`grp-<group>`, `groupClass`) on a
block's capability-bearing element beside its `cap-*` classes; the theme's
per-group rule sets the `--default-*` custom properties on it, and every
capability chain in `app.css` bottoms out in them
(`padding-top: var(--pad-d-top, var(--pad-d, var(--default-pad, 0px)))`).
The `--default-*` set is registered `inherits: false`, like the capability
vars: a card inside a container takes the cards' defaults, not the container's.

The defaults are **padding, corner radius, shadow, border, background** and
the **flow rhythm** (`capabilities/defaults/blockDefaults.ts`). Typography
stays with the paragraph styles ([typography.md](../typography.md)). Built
in, containers are padded `sm` with `sm` corners, cards have `md` corners and
the page rhythm is `md`; text and media blocks carry no padding or surface
capability, so their groups are empty and the Block defaults matrix shows only the groups
with something to set.

**Kind pins** are not defaults: where one kind must diverge from its group
(a table cell's corners are square in a bordered grid, the query result
container is flush and stacks its instances as a column), the kind's own
stylesheet sets the `--default-*` var — `table.css`, `query.css` —
and the block settings panel's Auto row reads the pinned value. A pin is declared inside
`@layer theme {}` in that stylesheet: it *sets* a default, so it lives in the
theme's layer, where its more specific selector outranks the group rule
([design-system/tokens.md](../design-system/tokens.md#cascade-layers)).

**The rhythm** has one cell for the page (where the cascade bottoms out,
24 px built in) and one per group. A group's rhythm is Auto by default, which
for a flow means "inherit the ancestor flow's"; a pinned group rhythm goes on the group's blocks and resets their
tablet and phone tiers, the way a flow with a rhythm of its own emits a
complete triple.

## Emission hygiene

Every emitter (`padVars`, `blockSpaceVars`, `surfaceVars`, `surfaceImageVars`,
`typographyVars`, `layoutVars`, `heightVars`) follows one predicate: **a tier's value is emitted only when the
CSS chain would resolve to something else without it** — at desktop against
the default (the group's, the style's look, the kind pin), at tablet against
desktop's effective value, at phone against tablet's. So there are no
materialized defaults, no identical desktop/tablet/phone triples, and padding
goes out as the uniform shorthand (`--pad-d`) with per-side vars only for the
sides that differ. The one deliberate exception is the rhythm: it is the
inheriting var, so a flow that pins a rhythm emits all three tiers, or an
ancestor's tablet tier would leak into it ([Block spacing](#block-spacing)).

## Override sets and the carrier

An emitter never writes a style string. It returns an **override set** — a map
of CSS property to value (`capabilities/overrides.ts`) — and a block's style
composer merges the sets of its capabilities. One step turns a set into a
carrier, and there are two carriers:

- **`styleAttr`** — the `style` attribute Tiptap's `renderHTML` writes in the
  editor;
- **the per-page stylesheet** (`capabilities/pageStyles.ts`) — what the
  public renderer uses. The reader's routes ship a strict `style-src`
  ([architecture/overview.md](../overview.md#content-security-policy)), under which
  a `style` attribute is blocked, so `renderDoc` registers every element's
  merged set with the pass's `StyleCollector` and puts the id it gets back on
  the element as **`data-b`**. The loader emits the collector's CSS as one
  `<style>` in the document head, under the response's nonce:

  ```html
  <p data-b="b1k7x2z">…</p>        [data-b="b1k7x2z"]{--pad-d:24px}
  ```

  Ids are **content-addressed** — a short hash of the set's declarations — so
  equal sets share one rule and a document renders the same ids every time.
  That is also why the id is not the block id: table cells and columns,
  inline typography runs and an HTML block's own elements carry overrides
  without being addressable blocks, and a query template stamps its block ids
  onto every result. `data-block-id` keeps its own job. An HTML block's
  authored inline styles take the same path: the sanitizer lifts each
  element's (already filtered) `style` into the collector
  (`sanitizeFragmentInto`). The collector is created per `renderDoc` call and
  travels through the `RenderContext` — never module state, since the server
  renders concurrent requests — and its rules are **unlayered**, so they beat
  the theme, the component CSS and the custom stylesheet the way an attribute
  did ([design-system/tokens.md](../design-system/tokens.md#cascade-layers)).

The two carriers agree on resolved values, not on markup: the editor shows
an override as an inline declaration, the page as a rule — parity is what the
element computes to. A block drawn by a Svelte component ([Svelte leaf blocks](anatomy.md#svelte-leaf-blocks))
uses the page's carrier in the editor and on the page: in the editor its rule ids go into
a **live per-document stylesheet** (`capabilities/liveStyles.ts`, a
constructed stylesheet on the document, pruned of unused rules after edits
settle), and the id is the set's — content-addressed — so the editor and the
page name the same rule. The inline carriers remain for the blocks that have
not migrated.

## Block spacing

Vertical space between blocks is modeled as **one value per boundary — the
space *above* a block** — resolved `spaceAbove ?? block-type default ??
blockSpace` on `margin-top`, per breakpoint. Nothing in page content sets
`margin-bottom`. That single-sidedness is the point: one margin per boundary
means no collapsing to reason about, and the first block of a flow has no
preceding block, so it is flush **by construction** — which is what keeps the
canvas's top padding and a bleed-to-top hero correct without a single
`:first-child` rule.

Three things carry it, in the order they compose:

- **The rhythm** (`blockSpace`, "Block spacing") belongs to a **flow** —
  something blocks sit inside: the page, a layout or flex container, a cell.
  Every block in that flow puts this much space above itself. A flow that sets
  none inherits its ancestor's; the page is where the cascade bottoms out, at
  the theme's page rhythm ([Capability defaults](#capability-defaults)). A
  flow's rhythm governs its *contents* only, never the space above the flow
  itself — a container's own margin comes from the flow the container sits in.
- **The block-type default** adjusts the rhythm per kind, as a multiplier: a
  heading earns more space before it than paragraphs get between them, a
  section (container, query result) more still. The table is CSS, in `app.css`
  next to the rule that reads it, and it is **the tuning point** for how a page
  feels — retuning the rhythm is editing that table, not hunting margins across
  a dozen stylesheets.
- **The override** (`spaceAbove`, "Space above") is one block breaking the
  rhythm. `0` is a real value, not "unset".

Both live in the Spacing capability's per-breakpoint bag, as plain px numbers
(the block settings panel's Auto/0/S/M/L are quick picks, not the stored type). Which
targets offer which row comes from the registry: `flow` earns a rhythm,
`spaced` earns an override. A **cell** is a flow but never a spacing target —
the space *between* cells is its container's `gap`, a Layout concern. The
**page** is a flow and nothing else; its rhythm is the one page-level value
that is authored, and it lives on the doc root node's attrs, which is also why
a write that rebuilds the doc from a block list carries it over rather than
resetting it ([Page settings](layout.md#page-settings)).

The rule that applies all this is one pair of selectors in `app.css`:

```
.canvas-blocks [data-block-id]:not(li):not(.ph-row)
  ~ [data-block-id]:not(li):not(.ph-row) { margin-top: … }
```

A **general** sibling, not an adjacent one, because ProseMirror puts elements
*between* blocks (the gapcursor widget, drag artefacts) and `~` states the real
predicate — "this block has a preceding block sibling", i.e. "is not the first
in its flow". Scoped to `data-block-id` because that is this codebase's
definition of a block (`blocks/catalog.ts`), which both renderers emit; `*`
would space decorations. And because `~` is parent-scoped, that one rule covers
every flow — page, cell, callout body, blockquote, table cell, query result —
with no list of flow classes to maintain.

A container is both a flow and a block, and those two roles want different
rhythms on one element — the one it gives its contents, and the one that decides
the space above it. So the rhythm travels under two names: a flow that is also a
block publishes `--flow-space-*`, and its **cells** relay that into the
`--block-space-*` their contents read. The cell is the DOM level that always
sits between a container and the blocks consuming its rhythm, and a cell is
never a spacing target itself, so nothing can end up feeding its own margin. The
page and cells publish both names — the page's copy is what a container with no
rhythm of its own relays from, and an undefined relay would not fall back to the
inherited value but wipe it (a custom property referencing a guaranteed-invalid
one is itself guaranteed-invalid). The page's copy is the theme's page rhythm,
a rule of the theme stylesheet on the canvas, unless the document pins one of
its own; a wiped tablet or phone relay falls to the desktop tier through the
owl rule's chain, which is right whenever no flow above set that tier.

Two deliberate exclusions: a **list item** keeps the list's own `--list-gap`
(a list also has no `spaceAbove` of its own — its `attrs.spacing` is already
taken by that item-gap enum), and the transient **placeholder** is never
spaced.

## Background images

The Surface capability's background has a second layer: an **image** over the
colour (`capabilities/surface/surfaceImage.ts`). Grid and flex containers,
page sections and their cells carry it (`SURFACE_IMAGE_TYPES`); a query
block, the page, a table and a quick link do not — one image for every
result means nothing, and the page's ground is a theme colour by design. Its
fields sit in the Surface bag beside the colour's, per breakpoint:

| Field | Values | Unset |
|---|---|---|
| `image` | an asset id | — |
| `imageFit` | `cover` · `contain` · `repeat` (Fill, Contain, Tile) | `cover` |
| `imageFocus` | the nine anchor points of the image block's focal point | `center` |
| `overlay` | a colour — a theme colour or a literal | none |
| `overlayOpacity` | 0–100 | 50 |
| `imageScheme` | `light` · `dark` | Auto |

Each field cascades on its own, desktop-first, like every capability field.
A breakpoint may bring an image of its own — **art direction**: a landscape
photo on a desktop, a portrait crop on a phone — or change only the focus
point. Whichever image a breakpoint shows, it is served as that
breakpoint's copies — about the canvas's width, at the screen's density — not
as uploaded, and a background the page opens with is fetched first
([media.md](../media.md#backgrounds)). The colour stays as the fallback, shown while the image loads and
around a contained one; the block settings panel calls it *Background colour (fallback)*
in Image mode. Overlay and scheme take effect only where an image resolves.
There is no fixed or parallax attachment and no gradient overlay.

**One declaration per tier.** `surfaceImageVars` emits the whole stack as
one `background-image` — the overlay as a one-colour gradient first, the
image under it — beside its size, repeat and position, sparse against the
tier above like every emitter (`--surface-img-*`, `app.css`'s
`.cap-surface` chain, written after the `background` shorthand that would
otherwise reset them). The URL is built from the asset id (`mediaUrl`,
`features/media`), never stored and never author-supplied, and reaches the
page through the per-page stylesheet like every override: `img-src 'self'`
admits it, and no `style` attribute is involved. The set also carries the
default text on the image (`--surface-fg-*`) and is merged after
`surfaceVars`, so a colour fallback's readable partner never paints text on a
photo. How the text's scheme is decided is
[theming.md](../theming.md#scheme-regions); print drops the image
([theming.md](../theming.md#emission)).

The image is decoration: no alternative text, no meaning a reader could miss.

### Asset references

A background image is a page asset exactly like an image block's: uploaded
through `POST /api/media` for the page being edited (raster only — PNG, JPEG,
WebP, GIF, its bytes checked against the declared type — at most 8 MB; its
metadata removed, measured, and served to smaller screens as WebP copies,
[media.md](../media.md)), stored
with the page as its owner, served by `/api/media/<id>` to whoever can read
that page, and deleted with it. What keeps an asset alive is a reference:
every save collects the document's asset ids (`collectAssetIds`,
`features/content/doc/assetRefs.ts` — image blocks, and the image of every Surface
bag at every breakpoint) and deletes the page's other assets. That one walk is
the seam anything that needs a page's assets uses — the garbage collection
now, an export bundle later — so a new place an asset id can live is added
there or its asset disappears on the next save. Agents cannot upload: the MCP
tools accept a background image only when the page owns the asset.

A share link grants its page, not the page's assets: `/api/media/<id>` asks
whether the *viewer* may read the owning page, so on a share link to a page
that is not public, images — blocks and backgrounds alike — do not load.

## Min-height

Containers and sections have a minimum height per breakpoint — what makes a
hero a hero (`capabilities/height/height.ts`, `cap-height`, `--min-height-*`). It is
its own capability rather than a Layout field: a grid container and a section
have no Layout capability, and the Layout capability's class makes its host a
flex box. Grid and flex containers and page sections carry it; cells do not.

A value is a length in **px, rem or svh** within bounds (40–2000 px, 2.5–125
rem, 10–100 svh). `svh` is a share of the small viewport height: unlike `vh`
it does not jump when a phone's address bar collapses, and unlike `dvh` it
does not resize the block while the reader scrolls, so `vh` and `dvh` are not
offered. The block settings panel's quick picks — Small 320 px, Medium 480 px, Large
640 px, Screen height 100 svh — are picks, not the stored type. Below
desktop *None* stores `none`, which takes back a larger viewport's height;
Auto stores nothing. A grid's auto rows stretch to the extra height, so a
cell's vertical alignment places a hero's text in it.

## Where capabilities are edited

The desktop editor splits block editing by scope. **Inline and text
formatting** (typography — family, size, colour, weight, metrics; bold,
italic, links) is selection-driven and lives in the toolbar. **Block-level
structure and surface** lives in the block settings panel
(`src/lib/features/editor/blockSettings/BlockSettings.svelte`): a section named
after the block for its own settings (image box, link-card target, … — the
block's panel under `editor/blocks/<kind>/`, [Block anatomy](anatomy.md#block-anatomy)), then
one section per capability the block supports (`editor/blockSettings/CapabilitySections.svelte`) — Layout
(section width, bleed-to-top, the flex Layout capability, a grid's columns
and gap per viewport), Placement (a block's moves in a section and a boxed block's
alignment in its column, [Placement](layout.md#placement)), Spacing,
Surface (for a container, a section or a cell first *Colour |
Image*: Image shows the image rows, upload through the editor's one image
picker, and keeps the colour as the fallback; Colour drops the image at every
viewport), and for a grid cell Alignment, for a flex cell Flex cell. A
container's Minimum height sits in its Layout section, a page section's in its
own. Every section renders through the design system's narrow-panel
block settings controls (`FieldRow` and friends, [design-system/overview.md](../design-system/overview.md)),
and each capability's rows come from its one shared edit component under
the editor's `capabilities/<name>/` (beside the content feature's
`capabilities/<name>/`, whose model it edits) — `SpacingField`,
`SpaceField`, `GutterField`, `SurfaceField`, `SurfaceImageField`,
`MinHeightField`, `LayoutField`, `TypographyField` (Placement and
Flex cell are an editor section each over their capability's setters) —
so the data model, the setters and the
resolvers are the only source of truth for what a value means. A row with no
value of its own shows what Auto resolves to ("Auto · 8 px", from the block's
group defaults; "Inherited · 16 px" on a smaller breakpoint), stores a value only
on an explicit pick, and its Auto segment clears it; the section's own reset
clears every field at the edited breakpoint at once. The panel's
top row picks the breakpoint those rows edit (and the canvas previews),
through the same `editTier` store the image resize handle and the canvas
overlay read.

**The page is the selection root.** It is a flow like a container or a cell —
the outermost one — so it is an ordinary target rather than a panel bolted
beside the block settings panel: the breadcrumb's first crumb, what select-parent reaches
from a top-level block, and the holder of the page's settings — Layout (its
reading and wide widths: Auto shows the site's, *Custom* takes a length),
Spacing (its Block spacing and its Page margin, the gutter at the edited
viewport) and Surface (its background, the page-strength theme colours
only). Width and background are one value for every viewport, so those rows
ignore the breakpoint switcher; the rhythm and the gutter follow it. It is the
chain's index 0 (`resolveSelectionChain`), with no position in the document,
so its attrs are written with ProseMirror's doc-attr step rather than by
position.

**On the canvas** (`editor/desktop/CanvasOverlay.svelte`), a hovered
block shows only its drag grip, in its top-right corner; everything else
waits for a selection. Over a block narrower than four grips — a short word
or a button in a content-sized flex cell, an empty cell's placeholder — the
corner would be the whole block, so the grip sits on the block's top edge
instead, outside it and flush, where the overlay has room above. An empty
cell holds the transient **placeholder**: its "+" opens the insert menu, its
hint ("Type, or choose a block") shows while it is empty, and typing makes
it a paragraph. In a flex cell, which its content sizes, the hint is what
gives an empty cell its width: the cell asks for the whole hint on one line
and, in a row short of room, shrinks to the editor's cell floor with the
hint ending in an ellipsis. The page never renders a placeholder, so none of
this reaches it.

A heading's level is its paragraph style, picked from the toolbar like a
paragraph's ([typography.md](../typography.md#paragraph-styles)). The space
above a text block is a block property, so paragraphs and headings carry a
Spacing section holding that one row.
