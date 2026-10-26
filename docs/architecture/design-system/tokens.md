# Tokens and rings

The chrome's design tokens, and the rules every indicator and every content
stylesheet follows: what the `--ds-*` tokens are and how they relate to page
content's own, how a focus or selection ring is drawn, and the cascade layers
page content is styled in. The overview is [Design system](overview.md).

## Tokens

Named `--ds-<category>-<name>` (e.g. `--ds-color-accent`, `--ds-space-md`,
`--ds-radius-md`) — visually distinct from the capability vars'
`--<capability>-<field>-<breakpoint>` shape (e.g. `--surface-radius-p`), so
the two systems are never confused at a glance.

Colour-dependent tokens — colours, the focus-ring colour, shadows — are
scheme tokens, declared as one complete set per colour scheme in
`src/lib/design-system/theme/tokens.ts` and emitted into the document head
([theming.md](../theming.md)); everything else is a static `:root` token in
`app.css`. The non-colour scales mirror the capability presets
numerically:

| `--ds-*` scale | Values | Mirrors |
| --- | --- | --- |
| `--ds-space-none/sm/md/lg` | `0/8/16/24px` | `PAD_PRESETS` (`capabilities/spacing/spacing.ts`) |
| `--ds-radius-none/sm/md/lg` | `0/4/8/12px` | `RADIUS_PRESETS` (`capabilities/surface/surface.ts`) |
| `--ds-shadow-none/sm/md/lg` | — | `SHADOW_PRESETS` (`capabilities/surface/surface.ts`), through `--content-shadow-*` |
| `--ds-weight-normal/medium/semibold/bold` | `400/500/600/700` | `WEIGHT_PRESETS` (`capabilities/typography/typography.ts`) |

CSS can't `import` a `.ts` const, so these are kept numerically in sync by
convention — the two are meant to be the same scale, not independently
tunable. If a capability preset ever changes, update its `--ds-*` mirror too.

Page content has its own static copy of the three ladders a capability
default is set in ([blocks/capabilities.md](../blocks/capabilities.md#capability-defaults)):
`--content-pad-none/sm/md/lg` (`PAD_PRESETS`), `--content-radius-*`
(`RADIUS_PRESETS`) and `--content-rhythm-*` (`BLOCK_SPACE_PRESETS`,
`0/16/24/40px`). Unlike the `--ds-*` mirrors these are generated
(`capabilities/defaults/tokens.ts`) and a unit test holds `app.css` to them;
a theme default is emitted as one of these properties, never as a literal.

`--ds-color-danger`/`--ds-color-danger-soft` are the one danger and error
red, which no component restates. Beside them are `--ds-color-on-accent` (text,
glyphs and the focus ring on an accent or danger fill) and the two stronger
border steps: `--ds-color-border-hover` is a bordered control's pointer-over
edge, and `--ds-color-border-strong` is the step that meets the 3:1 non-text
contrast minimum on `--ds-color-bg` — for a boundary that alone carries a
state or identifies the control, such as a switch's off track or a slider's
track. The resting `--ds-color-border` is a quiet hairline (1.2:1) and must
never be the only thing that shows a state. `--ds-color-raised` (white) is
the raised surface one step lighter than the page — a secondary button, a
switch or slider thumb — so a pressable thing reads apart from the off-white
fields beside it; `--ds-color-info`, `--ds-color-warning` and
`--ds-color-success` (each with a `-soft` ground) are the message tones
beside danger, each tone colour reading at 5.2–5.4:1 on its soft ground;
`--ds-color-scrim` dims the page behind a modal. Elevation has its own
grounds: `--ds-color-raised-modal` for a modal (Dialog, BottomSheet),
`--ds-color-raised-floating` for a floating layer (Popover, DropdownMenu,
Tooltip, a Select list), each with the `--ds-color-border-elevated` hairline —
a primitive reads the token for its level, never `--ds-color-bg`, because in
the dark scheme each level is a step lighter ([theming.md](../theming.md#the-schemes)).

The chrome-only scales have no capability preset to mirror:

| `--ds-*` scale | Values | Used for |
| --- | --- | --- |
| `--ds-control-h-sm/md/lg` | `28/36/44px` (`1.75/2.25/2.75rem`); `44/44/44px` on touch | the height of every bordered control of that size |
| `--ds-toolbar-h-sm/md` | `24/32px`; `44/44px` on touch | ToolbarButton / ToolbarGroupItem |
| `--ds-target-min` | `0`; `44px` on touch | the least a target that isn't a sized control measures |
| `--ds-text-xs/sm/md/lg` | `12/13/15/17px` | the chrome text ladder |
| `--ds-text-field-sm/md` | `13/15px`; `16px` on touch | the text typed into a field or shown as a picker's value |
| `--ds-radius-pill` | `999px` | chips, switch and slider tracks |
| `--ds-opacity-disabled` | `0.6` | every disabled control |
| `--ds-width-reading/browse` | `760px` / `72rem` | the column an app page sits in: the reading column of most routes, the wider one of a page of results browsed as a grid (the search page) |
| `--ds-sheet-gap` | `3.375rem` (54px) | the strip of backdrop a tall bottom sheet (`size="lg"`) leaves above it — the phone bar's height |
| `--ds-z-nav/scrim/modal/floating` | `150/200/201/300` | stacking layers |
| `--ds-keyboard-inset` | set at runtime, while an on-screen keyboard is up | its height: what a dialog, a sheet or a bottom bar subtracts to stay above it ([responsive.md](../responsive.md#the-on-screen-keyboard)) |

**Controls of one size share one height.** Button, Input, Select,
MultiSelect, Combobox, ChipInput, NumberField, SegmentedControl and the
colour and icon picker triggers all read `--ds-control-h-<size>`, so an
block settings row of a Select, a NumberField and a small Button lines up, and so
does a form row. `sm` is the narrow-panel (block settings) row, `md` the form row,
`lg` a prominent call to action. A composite frame (NumberField, ChipInput,
SegmentedControl) takes the height on the frame, border included, and its
inner parts fill it. The toolbar is a separate, denser family —
`--ds-toolbar-h-sm` for the block-tools overlay that floats over content,
`-md` for the header toolbar — because it never shares a row with form
controls. Heights are the one place a size variant is not free to pick its
own number; padding and font still follow the text ladder.

**Touch lifts the sizes, not the components.** Where the primary pointer is
a finger (`@media (pointer: coarse)` — phones and tablets; a laptop's
touchscreen beside its trackpad keeps the mouse sizes), one block in
`app.css` redefines the size tokens: every control height and toolbar item
is 44px, `--ds-target-min` is 44px, and a field's text is 16px (which also
keeps iOS from zooming into a focused field). Every primitive reads the
tokens, so a row of controls still lines up and nothing restates a
breakpoint. A target that isn't a sized control — a menu, select or command
item, a checkbox or switch row, a swatch, a chip's remove button, an
InfoTip's box, a trigger around an avatar — reads `--ds-target-min` as a
`min-height` (or inside a `max()` with its own size), which is nothing with
a mouse. [responsive.md](../responsive.md#touch) has the reasons and what it
changes on each page.

**Text sits on the ladder.** A control's own text is `sm` (in the `sm` row)
or `md`; `--ds-text-xs` is only for secondary text *beside* a control — a
row's muted hint, a unit inside a number box, a badge. A label in a control
row takes the same size as the controls' text, never a size between steps.
The ladder is the chrome's; page content has its own, the type scale
(`--type-xs` … `--type-6xl`, [typography.md](../typography.md)).

The stacking layers are ordered by what must cover what: the app bar's hover
menus (`nav`) sit under a modal's scrim and content (`scrim`, `modal`), and
every floating layer (`floating`: Select and Combobox lists, Popover,
DropdownMenu, Tooltip) sits above a modal, because those routinely open
inside one.

**No responsive variants.** Component chrome isn't page content: it doesn't
live inside `.page-canvas`'s `container-name: canvas` context, and
Dialog/Popover/DropdownMenu portal to `document.body` by default (detached
from any container-query ancestor — a `@container canvas` rule on a
portalled element wouldn't fire). `--ds-*` tokens are flat `:root`
constants, with no `@property`/`inherits: false`
machinery — that machinery exists to isolate nested capability-bearing
elements from their ancestors' overrides, a concern `--ds-*` tokens don't
have.

This layer is what theming retargets: a colour scheme redefines the whole
set for the document or for a subtree ([theming.md](../theming.md)). Chrome
reads `--ds-color-*`; page content (`RenderedContent.svelte`, the block
stylesheets under `features/content/blocks/`, the capability style builders)
reads its own `--content-*` palette, never the chrome's — so a content scheme
or a site theme can set a page apart from the shell, and a block may override
a content token for its own subtree (a callout variant sets
`--content-accent`).

**A band that brands itself** (the app bar, from the site theme) re-points
the `--ds-color-*` tokens on itself, so every control inside reads on it.
A floating layer belonging to the page — one rendered in place rather than
portalled, like the nav menu's submenu — takes the page's values back from
`--ds-page-*` ([theming.md](../theming.md#site-theme)); with no band above,
each is the value it already had.

Page content renders identically in the editor and on the published page, so
its rules live once: `features/content/blocks/canvasContent.css` styles the
elements the text marks and code blocks emit (lists, quotes, inline code and
code blocks, page and document links, a diagram — its centring, its waiting
text, its error) under `.canvas-blocks`,
the class both the public article and the editor's ProseMirror root carry,
and `RenderedContent` and both editor shells import it. An editor shell adds
only editing affordances on top (a pointer on links, the semantic-property
pill in `--ds-color-property`), never a second copy of a content rule.

## Focus and selection rings

**Rings render inside the box.** Every indicator that says "this element is
focused, selected, hovered or active" is painted within the element's own
border box, never extending past it. An indicator drawn outside the box is
free-floating geometry no ancestor accounted for: it gets clipped by the first
overflow-hiding container (a dialog body, a popover panel), and where nothing
clips it, it silently enlarges the nearest scroll container instead.

The consequences are mechanical:

- **`outline-offset` is `calc(-1 * width)` — never `0`, never positive.** An
  outline always paints *outward* from the border edge, so offset `0` still
  sits `width` px outside the box. Only the negative form is actually inside.
- **An overlay-drawn ring covers its measured box exactly**, with no outset
  padding on any side, and relies on the global `* { box-sizing: border-box }`
  so its own border paints inward.
- **Never mask an overflowing ring with `overflow-x: hidden`.** That clips the
  indicator and leaves the real geometry wrong; pull the ring in instead.

**The ring contrasts with its ground.** An inset ring paints over the
control's own fill, so its colour has to read against that fill, at the 3:1
non-text minimum. The accent ring does on the page, on white and on
accent-soft (4.7–5.2:1) — and is invisible on an accent fill (1:1) and nearly
so on danger (1.3:1). A filled surface therefore **swaps the ring's colour
and inset for its own subtree** by setting
`--ds-focus-ring-color: var(--ds-color-on-accent)` and
`--ds-focus-ring-offset: var(--ds-focus-ring-offset-filled)` on the variant
(Button `primary` and `danger`, the active SegmentedControl item,
ToolbarButton `primary`): token values, not a second ring — the global rule
still paints it. The extra inset keeps fill on both sides of the light ring;
flush against the edge it reads as the control shrinking against the page
rather than as a ring. That is why the global rule reads the width and colour
parts rather than the composed `--ds-focus-ring`: a composed custom property
is substituted where it is declared (`:root`), so an override of its colour
part on a descendant would never reach it. A state that returns the fill to a
light ground (Button `active`) sets the colour back to the accent.

**One ring, one place.** `--ds-focus-ring-width` and `--ds-focus-ring-color`
are consumed by the single unscoped `:focus-visible` rule in `app.css`, which
reaches every interactive element in the app. A primitive must **not** restate
that rule — not with a different offset, not with the same one. This is why
`Button`, `Select`, `SegmentedControl`, `Switch` and the rest carry no focus
CSS at all — and why even a stray native `<select>` is correctly ringed
without anyone styling it (the ring is the one thing a native element gets
right; everything else about it is why `check-ui` flags it, see
[Guardrails](overview.md#guardrails)).

Where a primitive genuinely must restate the ring, it does so from
`--ds-focus-ring` and `--ds-focus-ring-offset` — the whole declaration and the
whole offset, so no value is ever repeated by hand. (Those restatements all
sit on light grounds, where the composed token's accent is right; a filled
one would restate from the parts, as the global rule does.) Four narrow
categories:

- **`all: unset` base rules** — `Popover`, `DropdownMenu` and `Tooltip`'s
  triggers, `AccordionItem` and `CollapsibleGroup`. `all: unset` also resets
  `outline-style` to `none`, at the *same* specificity as the global rule, so
  which one wins is decided by CSS injection order — the same fragility
  [`ToolbarButton`](patterns.md#composing-toolbar-with-overlay-triggers) avoids, and not something `:global()` or
  specificity juggling controls. These restate the ring so they are
  focus-visible regardless of order. (Raising the global rule's specificity
  instead would have been worse: it would then also outrank the deliberate
  suppressions below.)
- **Composite frames** — `NumberField` and `ChipInput` wrap a borderless input
  in their own bordered box. The input takes focus but the frame is the
  visible control, so the frame restates the ring under `:focus-within` (from
  the same tokens) and the inner input suppresses its own with `outline:
  none`. `ChipInput` additionally suppresses the nested `Combobox` entry's
  ring, or two rings would nest. The search overlay's `.search-bar` is the
  same shape without the border: a flush palette row whose magnifier, input
  and close button together read as one field.

  **When the frame holds a second focusable element, scope its ring to the
  input with `:has()` instead of `:focus-within`.** `:focus-within` matches
  whichever descendant has focus, so focusing the search bar's close button
  would light up the whole bar *and* let the button draw its own ring — two
  rings for one focus. `:has(.search-input:focus-visible)` names the one
  element the frame stands in for, leaving every sibling to ring itself. A
  frame whose only focusable is the input (`NumberField`, `ChipInput`) has no
  such ambiguity and stays on `:focus-within`.

  A frame that passes a class into the primitive it wraps styles **its own**
  class (`ds-chip-entry`, `search-input`), never the primitive's internal one
  — see [Don't borrow a primitive's internal class name](primitives.md#styling-bits-ui-wrapper-primitives). Such a rule
  needs `:global()`, since the element lives in the primitive's template.
  The primitive itself stays ringed by default, so a consumer that does not
  wrap it in a frame is still correct.
- **Deliberate `outline: none` where there is no visible control to ring** — a
  `Dialog`/`BottomSheet` content element that takes programmatic focus on
  open, and the `.ProseMirror` contenteditable in both editor shells (a
  ring around the whole document body means nothing; the caret is the
  indicator). These are the only sanctioned suppressions. Removing a ring
  and replacing it with a background tint is *not* one of them — a tint is a
  hover affordance, and leaves keyboard users without an indicator.
- **A ground no single colour contrasts with** — a `ColorField` swatch, whose
  fill is any palette colour. There the ring is `--ds-color-fg` and adds
  `--ds-focus-ring-companion`, an inset `--ds-color-bg` band just inside it,
  so the ring reads on a light swatch and the band on a dark one. The two
  tones must be far apart for this to hold on *every* ground: fg and bg are
  16.8:1 apart, so one of them always reaches 3:1, whereas accent and bg
  (5.2:1) both fall under 3:1 on a mid-tone sky or amber swatch. It is the
  same two-tone answer as the editor's selection overlay below. A swatch's
  *selection* is not a ring at all — a check on a small bg-coloured disc — so
  the selected swatch and the focused one never look alike.

A background tint, an accent border-swap, or a hover treatment may accompany
the ring, but never substitutes for it.

The editor's block selection/hover indicators follow the same rule by a
different mechanism: they are absolutely positioned overlay divs
(`CanvasOverlay.svelte`) sized from a measured `getBoundingClientRect`, so
"inside the box" means the overlay's geometry is the measured box verbatim. A
`[data-width='full']` block's box already spans the canvas border box, and
`.editor-scroll` sets `overflow-y: auto` — which makes the *other* axis
compute from `visible` to `auto` — so any outset there becomes a real
horizontal scrollbar on the canvas.

That selection overlay carries an inset white hairline inside its accent
border. It is a contrast companion, not decoration: a block can set its own
Surface background from `COLOR_SWATCHES`, and the accent alone falls under the
3:1 non-text contrast minimum on most of those (1.47:1 on slate-600, 2.83:1 on
slate-800). The hairline restores it there (7.6:1 and 14.6:1) and is invisible
on the white canvas. Being an inset shadow, it stays within the box like the
ring itself.

## Cascade layers

Page content is styled in three cascade layers, declared in
`src/lib/platform/cssLayers.ts` and repeated at the top of every
participating sheet as `@layer base, theme, custom;` (whichever sheet the
browser parses first fixes the order, and under `vite dev` that is not always
`app.css`):

| Layer | Holds | Role |
|---|---|---|
| `base` | `app.css` whole, the block stylesheets, `RenderedContent`'s own styles | *consumes* the capability variables (`var(--pad-d, var(--default-pad, …))`), sets none |
| `theme` | the scheme tokens, the capability defaults and paragraph looks the theme emits, and each block's **kind pins** (`@layer theme {}` in place in `query.css`, `table.css`, `quickLink.css`) | *sets* a default; a pin outranks the group rule inside the layer by specificity |
| `custom` | the site's custom stylesheet | the admin's rules beat the theme and the component CSS whatever their specificity |

A block's **own overrides** — the per-page stylesheet's `[data-b]` rules
([blocks/capabilities.md](../blocks/capabilities.md#override-sets-and-the-carrier)) — are **unlayered**,
so at (0,1,0) they beat all three, as a style attribute would; an HTML
block's authored inline styles ride the same rules and beat `.prose`.
Only `!important` outranks them. The design-system
primitives' own styles stay unlayered too: they never select content
elements, and layering them would reshuffle the chrome's cascade for nothing.
That is also why no primitive ever stands inside content as an **authored
surface**: a quick-link card, a callout's box, a table is a plain element in
the block's classes, styled by the layered cascade and the per-page rules
([blocks/anatomy.md](../blocks/anatomy.md#svelte-leaf-blocks)). A primitive appears inside a
block only as a **control** — a listing's tabs, a "load more", a copy
action — and then unchanged. The test when unsure: should an author's
Surface, Typography or Spacing capability be able to change this element?
Yes: a surface, block CSS. No: a control, the primitive. A surface that
needs button-like behaviour (focus, keyboard, a pressed state, aria) takes
it from the global `:focus-visible` ring and, once more than one block
needs the same, from headless pieces — behaviour without a look — never
from a primitive's styles.
A variant's built-in look (`.quick-link--outlined { --default-border: … }`) stays in
`base`, below the theme, so an admin's cards default still reaches it. A unit
test (`cssLayers.test.ts`) fails when a rule in a layered sheet escapes its
layer.
