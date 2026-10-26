# Responsive behaviour

How pages and the app fit a phone and a tablet: the tiers page content
responds to, the one rule every surface keeps, how each block keeps it, and
the test that holds it. The capability model the tiers belong to is
[blocks/overview.md](blocks/overview.md); the chrome's primitives are
[design-system/overview.md](design-system/overview.md).

## Two kinds of breakpoint

**Page content responds to its canvas, not to the viewport.** The canvas
(`.page-canvas`) is the `canvas` query container, and every capability rule
picks its tier with `@container canvas`:

| Tier | Canvas width |
|---|---|
| desktop | wider than 900 px |
| tablet | 900 px or less |
| phone | 640 px or less |

A capability value is stored per tier and cascades desktop → tablet → phone
([blocks/capabilities.md](blocks/capabilities.md#the-capabilitycascade-system)). Because the tiers read
the canvas, the editor previews a tier by narrowing its canvas — 820 px for a
tablet, 390 px for a phone — and the same rules fire as on a device. Print has
no container, so a printed page is the desktop tier fitted to the sheet.

**The chrome responds to the viewport** (`@media`). The phone shell — the
app bar at the bottom of the screen, actions folded into the menu sheet, the
phone editor ([editor.md](editor.md#the-phone-shell)) — shows on a window
640 px wide or less, and on a phone held sideways: a touch screen
(`pointer: coarse`) 500 px tall or less. Held sideways a phone is as wide as
a small tablet but too short for the desktop chrome, which would leave a
sliver of canvas between a top bar, a toolbar and the keyboard; and turning
the phone never swaps the shell under the author. That query is one
constant, `PHONE_SHELL_MEDIA` (`lib/design-system/shell.ts`), written into
every chrome `@media` that picks the shell; a rule about a narrow window
alone — a footer's gaps, two columns side by side — keeps the bare width.
At 640 px and below the graph's settings open in a bottom sheet
([graph-view.md](graph-view.md#the-settings-a-panel-or-a-sheet-on-a-phone)).
At 768 px and below — the **compact chrome**, `COMPACT_CHROME_MEDIA` beside
`PHONE_SHELL_MEDIA` in `src/lib/design-system/shell.ts` — the search page
folds its filter row into a filter sheet ([search.md](search.md#on-a-phone)),
the settings sidebar becomes a sheet and the editor's block settings panel overlays the
canvas. The search page folds on a phone held sideways too, so its query adds
that clause to the constant's text. The two scales are independent: a 768 px
tablet shows the tablet tier of the page inside the desktop chrome, and a
phone held sideways the tablet tier inside the phone shell.

## What scrolls

**The document scrolls.** Every route the root layout frames — a page, a
document, a share link, the home list, search, settings, sign-in — is one
column in normal flow (`src/routes/+layout.svelte`), at least as tall as the
screen, so a short page still has its footer at the bottom. What stays in
place while the page scrolls is `position: fixed`: the app bar (at the top on
a desktop, at the bottom in the phone shell), the local-graph panel and its
tab, toasts, and every overlay.

This is what lets the router handle scrolling, because SvelteKit scrolls the
window and nothing else:
- a link opens the next page at its top;
- a link to an `#anchor` scrolls that element into view;
- back and forward return the reader to where they were on each page.

A scroll box of the shell's own would outlive every navigation and keep its
position through all of them. `src/lib/shell/e2e/navigation-scroll.spec.ts`
checks all three behaviours at a desktop's width and at a phone's.

**Nothing ends up under the fixed bar.** `--appbar-top-inset` and
`--appbar-bottom-inset` (`app.css`) are what the bar covers of the screen's
top and bottom edges: the top bar's height on a desktop, the bottom bar's in
the phone shell. The document's scroll padding is set from them. An anchor, a
field the keyboard reveals, or a list scrolled to its start therefore stops
beside the bar, not behind it. A sticky element sticks at
`top: var(--appbar-top-inset)`. That covers the settings sidebar, the
settings section bar on a narrow screen (anchors in the pane also clear the
bar's own height), the playground's index, and a sticky element in a free
stylesheet.

The document's scrollbar is hidden; the page still scrolls by wheel, keys,
touch and drag-select. A visible scrollbar would stand to the right of the
local-graph panel, and would appear and vanish between short and long pages,
shifting the page's width.

**Some pages have their own scrollers.** A page that is not a column of
content keeps a fixed shell with scrollers of its own, because its parts
scroll independently under chrome that stays put:
- the desktop editor: the canvas beside the block settings panel;
- the phone editor: the canvas between its head and its toolbar;
- the document editor;
- the graph view: a canvas that pans, beside its settings panel.

None of these is reached by a link from inside itself: the editor's own
links reload the document, and renaming a page's slug deliberately replaces
the address without scrolling. So each one opens with its scrollers at the
top.

## The rule: nothing scrolls sideways

At a phone's or a tablet's width no surface scrolls horizontally — not the
page, not one element reaching past the screen's edge, not one word running
past its line. Content wider than its column is a block's own business: the
block holds it in a box of its own that scrolls sideways, and nothing else on
the page moves. Three blocks have such a box — the table, the code block and,
on a tablet or phone canvas, the HTML block — and a flex row has one at a
viewport its author set to scroll sideways
([blocks/layout.md](blocks/layout.md#flex-arrangement-per-tier)).

How content keeps the rule:

- **Text breaks.** A word or URL longer than its line breaks at the edge, and
  a long word is hyphenated where the content language allows it (the canvas
  carries the node's `lang`; only words of ten letters or more, with four on
  each side of the break — a German compound, not every other line of body
  text). Code is never hyphenated, and a code block keeps its lines and
  scrolls. The break is `overflow-wrap: break-word`, which leaves a word's
  full width as its box's minimum, so a flex cell or a button shrinks to its
  longest word and no further (`blocks/canvasContent.css`).
- **A table never squeezes its columns.** It is at least as wide as its
  column, and wide enough that its narrowest column is 6.5 rem — every other
  column is its weight's multiple of that, so the stored weights still
  proportion the columns. In the editor a column drag stops where the
  column would become narrower than that at the table's width, so a table
  that fits its column keeps fitting, and one already wider gets no wider
  (`blocks/table/TableHandles.svelte`). No column counts as narrower
  than 5% of the table, so one stored narrower (an older table's added
  column) is drawn at that floor instead of stretching the table
  (`blocks/shared/gridResize.ts`). A column added to a table or a
  grid takes the average share of the others. Where that is wider than the
  column, the table's block scrolls. On paper the table fits the sheet's
  column instead (`blocks/table/table.css`). A table's own shadow is
  drawn inside that scroll box, so its edges are clipped.
- **An HTML block's images fit its column**, and on a tablet or phone canvas
  the block scrolls when its markup is wider (an authored table, a fixed
  width). On a desktop canvas it doesn't: a scroll box would clip what an
  author lets reach past the block's edge (a card's shadow) and stop its first
  and last child's margins from collapsing through it.
- **A flex cell is never wider than its row.** An Auto cell is as large as
  its content and shrinks when the row has no room — down to its longest word
  — so its text wraps instead of the row overflowing. A wrapping row still
  breaks its lines on the cells' full sizes first, so a row of buttons wraps
  before a button is squeezed. Fill cells keep their content as their
  minimum; a Fixed cell yields below its size where the row does not wrap
  ([blocks/layout.md](blocks/layout.md#placement)).
- **A query result** is never wider than its result container.
- **A container never overflows by collapsing** — how it collapses is
  [the layout policy](#how-compositions-collapse) below.

The chrome keeps the same rule with the design system's patterns: a
settings table scrolls in its wrapper with a minimum width
([design-system/overview.md](design-system/overview.md)), a row of actions wraps, and a
column of text has a width bounded by its container, never by its longest
word.

### Scroll cues

A box that scrolls sideways shows that it does: it fades the edge where more
of it waits — its end until it is scrolled there, its start once it has
moved — so a cut-off table column, a strip's next logo or a code line's tail
reads as "more", not as the end of the content. It is one rule in `app.css`
for every such box: page content's tables, code blocks, an HTML block on a
narrow canvas and a flex row set to scroll sideways, and in the chrome every
box with the `scroll-cue` class (a settings table, a row of tabs, the
search filters, the phone editor's tool strip, the compare view). The fade
is a mask driven by the box's own scroll position — a scroll-driven
animation of two widths, no script — so it fades whatever the box shows on
whatever ground it stands, and a box with nothing to scroll fades nothing.
It is set only where the box is a scroll box: on a wide canvas an HTML block
or a flex row doesn't scroll, and a mask there would clip what they let
reach past their edge. A browser without scroll-driven animations (Firefox)
shows the boxes without the cue. Chrome and Firefox let the keyboard reach a
scroll box with nothing focusable inside it; the boxes add no tab stops of
their own, which a box that fits would offer for nothing.

Chromium keeps a box's fade at its start when the box was scrolled and a
wider window then makes it fit, until the page reloads — the timeline holds
its last position once there is nothing left to scroll.

## How compositions collapse

How a composition fits a phone is the author's decision, made per viewport
with the same settings that make it on a desktop; the system never guesses
an intent from a shape. What each container does when nothing is set:

| Container | Tablet (Auto) | Phone (Auto) | Set per viewport |
|---|---|---|---|
| Grid | the desktop's columns | one column, cells in document order | columns and gap ([blocks/layout.md](blocks/layout.md#grid-columns-per-tier)) |
| Page section | the page template's tablet columns | the page template's phone columns | the page's column template ([blocks/layout.md](blocks/layout.md#page-layout-sections)) |
| Flex row | the desktop's arrangement | the tablet's arrangement | the arrangement — in one row, stacked, wrapped into lines or scrolling sideways ([blocks/layout.md](blocks/layout.md#flex-arrangement-per-tier)) — alignment, gap, and each cell's size ([blocks/layout.md](blocks/layout.md#placement)) |

Stacking on a phone is right for prose columns and wrong for small
compositions that belong side by side; those are built so:

| Composition | Built with | On a phone |
|---|---|---|
| A symbol beside its text | a flex row — symbol cell Fixed, text cell Fill; or a grid [1, 6] with the phone's columns [1, 6] | a row; the text wraps |
| Four figures | a grid [1, 1, 1, 1] with the phone's columns [1, 1] | 2 × 2 |
| A row of cards | a flex row set to Wrap into lines, the cells Fill | wraps |
| A strip of logos | a flex row, the cells Fixed, on the phone Scroll sideways (or Wrap into lines) | scrolls in its own box (or wraps) |

## The editor collapses like the page

The editor renders through the same stylesheets as the public page, so a
canvas of the same width lays out the same way: the desktop editor's phone and
tablet previews match the page at 390 and 820 px, and the phone editor's
canvas is the device's full width. The editor wraps its text exactly as the
page does, so a word an author sees break in the editor breaks for readers
too.

## Touch

A finger is larger than a mouse pointer and has no hover. Where a device's
primary pointer is a finger — `@media (pointer: coarse)`: a phone or a
tablet, not a laptop whose touchscreen sits beside its trackpad — the chrome
changes in three ways, all through the design system's size tokens
([design-system/tokens.md](design-system/tokens.md#tokens)), so no component carries a
breakpoint of its own:

- **Every target is 44px.** Controls and toolbar items, menu, list and select
  items, checkbox and switch rows, swatches, the logo and the account
  trigger. This is the size Apple's and Android's guidelines ask of a finger,
  above WCAG's 24px floor, which a mouse keeps: on a desktop every size stays
  as dense as it was. A tablet's desktop chrome gets it too — the editor's
  toolbar, the block settings panel and the selected block's tools, which sit above the
  block where a whole row of them fits and never reach past the canvas's
  left edge.
- **Every field's text is 16px.** Below that a phone zooms into a focused
  field; at 16px a field reads like the page around it.
- **Help opens on a tap.** An InfoTip is a toggletip: a tap pins it open; a
  second tap, a tap outside or Escape closes it. The editor shows no hover
  tools to a finger — a tap's compatibility mouse events would raise them
  under it, where they would take the tap meant for the text; the selected
  block's tools offer the same.

What doesn't fit a phone's width at that size scrolls in a box of its own:
the phone editor's tools are a strip that scrolls sideways, with Save
pinned at its end, and a selected block's delete is the strip's first tool
rather than a button floating over the block above.

Page content follows the same rule where it is a target: a quick link is
at least 44px tall on touch (`blocks/quickLink/quickLink.css`). A link inside
a line of text stays text — WCAG exempts it, and a 44px line would tear the
paragraph apart.

### The on-screen keyboard

A phone's keyboard covers the bottom of the screen without making the page
any shorter — iOS always, Android by default — so a dialog centred in the
screen, a sheet at its bottom or the phone editor's toolbar would sit under
it, a footer's buttons or the field being typed into hidden. What stays
visible is the visual viewport; the keyboard is the part of the page below
it. One listener in the root layout (`design-system/keyboardInset.ts`)
publishes that height as `--ds-keyboard-inset` on `<html>` while a keyboard
is up (a pinch-zoom, which shrinks the visual viewport too, doesn't count),
and the layers that must stay usable subtract it: a dialog centres in what is
left and shrinks to it, its body scrolling; a sheet stands on the keyboard;
the phone's full-screen search ends at it, so its results scroll above it;
the phone editor's toolbar rides on it — its tools are for the text being
typed — and its canvas can scroll its last line above both; a toast rises
above it. The field that opened the keyboard is scrolled into view once the
layers have moved. The app bar stays where it is, behind the keyboard. One
mechanism serves both platforms: iOS ignores the viewport setting that would
make Android resize the page instead.

## Images

A device gets an image at about the width it shows it at, not as uploaded:
an image block offers the image's WebP copies at a fixed ladder of widths
along with the image itself, says how wide it is shown on each viewport, and
the browser picks — a phone's column takes a 640 px copy of a 1600 px photo.
A background asks for its tier's copies at the screen's density — a hero
across a phone is a 1280 px copy, not the 2400 px upload — and the image a
page opens with is fetched first
([media.md](media.md#copies-for-smaller-screens)). Whichever copy it is, the
image keeps the box its column gives it at its own aspect ratio, in the
editor as on the page (`content/e2e/image-parity.spec.ts`).

On paper a code block wraps its long lines at the sheet's edge: paper can't
scroll.

## The guardrail

`src/lib/shell/e2e/responsive.spec.ts` opens representative pages — an
article on a columns page, a landing page of containers, tables and query
results, a page with every block kind, a document, a share link, the home
list, settings, the phone and the desktop editor — at 360, 390 and 768 px,
with content written to break narrow columns (a 52-letter statute name, a
long URL; `tests/e2e/responsive-probe.ts`). It asserts:

- **No sideways overflow** (`horizontalOverflow`, `tests/e2e/responsive.ts`):
  neither the document nor an editor's own scroller is wider than its box
  ([What scrolls](#what-scrolls)), and no element's box and no text run
  reaches past the viewport, unless a box of its own that scrolls or clips
  inside the viewport holds it.
- **The layout fingerprint** of the probe pages' containers at 390 and
  768 px (`layoutFingerprint`): kind, tracks or direction and wrap, and lines
  × cells — and each image block's box as its shape, the picture's own aspect
  ratio unless a fitted box sets one. The expected fingerprints in the spec are the layout policy,
  written down: a change to one is a change of how pages collapse, made on
  purpose.
- **Parity**: the phone editor's fingerprint equals the page's at the same
  width, and the desktop editor's previews equal the page at 390 and 820 px.

`src/lib/shell/e2e/touch.spec.ts` runs the touch side with a finger
(`hasTouch`): the home page, a page of every block kind, the search overlay,
the menu sheet, the login form, the phone editor and its sheets, settings
pages and a dialog at a phone's width, and the desktop editor, its
block settings panel and the account menu at a tablet's; held sideways, a phone gets
the phone shell, and its editor edits the tier its canvas shows as it turns,
while a desktop window of the same size keeps the desktop shell. With a
stand-in for the on-screen keyboard (the visual viewport, shrunk), a dialog
keeps its footer and focused field above it, and the phone editor's toolbar
and sheets stand on it. The responsive spec checks the scroll cues: a wide
table fades its end, then its start once scrolled, and a table that fits
fades nothing. Each must have no target under
44 × 44 px and no field under 16px (`touchTargets`, `tests/e2e/responsive.ts`)
and nothing scrolling sideways; InfoTips open and close by tap, and a mouse
keeps the dense sizes. The design-system lane sweeps every primitive's
specimen the same way.

A new kind of surface, or a block with a new way to be wide, joins the
guardrail with a page in `responsive-probe.ts` and a test in the spec.
