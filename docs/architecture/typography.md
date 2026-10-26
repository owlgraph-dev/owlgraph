# Typography

How page content is sized and set: the type scale, how a size is stored and
rendered, the paragraph styles a text block is set in, the built-in looks
those styles start from, and the base leading. The chrome has its own text ladder (`--ds-text-*`,
[design-system/tokens.md](design-system/tokens.md#tokens)); nothing here applies to it.

## The type scale

Page content picks its font sizes from one scale of ten named steps. The
paragraph styles' built-in looks and the size picker in the editor both read
it, so there is no second list of sizes anywhere.

| Step | Size | On a narrow canvas |
|---|---|---|
| `xs` | 0.75rem | — |
| `s` | 0.875rem | — |
| `m` | 1rem | — |
| `l` | 1.125rem | — |
| `xl` | 1.25rem | — |
| `2xl` | 1.5rem | — |
| `3xl` | 1.875rem | shrinks to 1.625rem |
| `4xl` | 2.25rem | shrinks to 1.75rem |
| `5xl` | 3rem | shrinks to 2.125rem |
| `6xl` | 3.75rem | shrinks to 2.5rem |

Each step is a static token, `--type-<step>`, in `src/app.css`'s `:root`,
next to the other tokens that do not change with the colour scheme
([theming.md](theming.md)). The table itself lives in
`capabilities/typography/typeScale.ts` (`TYPE_SCALE`), which generates each
token's value (`typeScaleCss`); a unit test holds `app.css` to exactly those
values.

The names follow the size vocabulary used elsewhere (spacing, radius and
shadow are small/medium/large too) rather than pixel values: a value is hard
to remember and ties a step to one root size, and ten semantic names ("body",
"lead", "title", …) would be harder still to keep apart.

### Why rem

A step is `rem`, never `px`, because `rem` follows the reader's own font-size
setting (the browser or operating system preference); `px` ignores it. `em`
would be wrong: it compounds with nesting, so a size inside a heading inside
a cell would grow twice.

### Fluid steps

`rem` alone does not make a large heading fit a phone — it is relative to the
root size, not to the screen. So the four largest steps are fluid: each is a
`clamp()` between a floor and its full size, linear in between.

| Step | Token value | at 360px | at 786px | at 960px and wider |
|---|---|---|---|---|
| `3xl` | `clamp(1.625rem, 1.475rem + 0.667cqi, 1.875rem)` | 26px | 28.8px | 30px |
| `4xl` | `clamp(1.75rem, 1.45rem + 1.333cqi, 2.25rem)` | 28px | 33.7px | 36px |
| `5xl` | `clamp(2.125rem, 1.6rem + 2.333cqi, 3rem)` | 34px | 43.9px | 48px |
| `6xl` | `clamp(2.5rem, 1.75rem + 3.333cqi, 3.75rem)` | 40px | 54.2px | 60px |

(Widths are the canvas's content width; sizes at a 16px root.)

- **The line** runs from the floor at a 360px canvas (`FLUID_MIN_CANVAS`) to
  the full size at 960px (`FLUID_MAX_CANVAS`). For a floor `min` and a full
  size `max` in px, the slope is `(max − min) / 6` cqi and the intercept
  `min − 3.6 · slope` px, written in rem. Desktop canvases are at or near full
  size, the editor's tablet preview at about nine tenths, a phone at the
  floor.
- **The floors keep the steps apart**: at every width each step stays larger
  than the one below it (3xl's floor sits above 2xl). A unit test checks this
  across widths.
- **The intercept is rem** and only the slope is `cqi`, so the reader's
  font-size preference still moves the whole curve; the canvas width is the
  second lever, not a replacement for the first.

The unit is `cqi` — a percent of the query container's inline size — not
`vw`. The page canvas (`.page-canvas`, `container-type: inline-size`) is the
one content query container, and it is often narrower than the window: next
to the editor's block settings panel, in the tablet and phone previews, in a comparison
panel. Everything else responsive in content already keys off it
(`@container canvas`), so a heading shrinks exactly when the rest of the
page reflows. It is the canvas's width that counts, not the reading
column's: a page that narrows or widens its reading width
([blocks/layout.md](blocks/layout.md#page-settings)) does not move its type. No block establishes a container of its own, so `cqi` anywhere
in content resolves against the canvas.

Two consequences shape how the tokens are declared:

- **They are not registered with `@property`.** A registered `<length>`
  would compute its `cqi` where it is declared, at `:root`, where there is no
  container. Unregistered, the value is substituted as tokens and the `cqi`
  resolves where `font-size` is computed — inside the canvas. (The
  Typography capability's own `--typography-size-*` properties are registered
  with `syntax: '*'`, which likewise keeps the value as tokens.)
- **Print pins them to full size.** Print turns the canvas's container off,
  so `cqi` would fall back to the narrow sheet and every large heading would
  print mid-way down its range; the print block sets 3xl–6xl back to their
  full rem, matching the desktop base print already uses.

A preview of a step outside the canvas — the size picker, which portals to
the page body — uses a static length, never `var(--type-<step>)`, which
would resolve against the viewport there.

## How a size is stored

A stored size, in the Typography capability, in the inline size mark and in
a typography branding token, is one of two things:

- **A step reference**, `scale:<step>` (the parallel of `token:<name>` for
  colours). It renders as `var(--type-<step>)`, so it follows the reader's
  setting and, from 3xl up, the canvas width.
- **A px number** (8–96) — a deliberate literal, the escape hatch. It renders
  as that exact px size in every context and does neither.

Content stored before the scale existed is all px, and stays exactly that: a
literal is never migrated onto the scale.

Every read of a stored size goes through `sizeOrNull` (`typeScale.ts`): a known
step reference is kept, a number (or a numeric string, from an HTML
attribute) is clamped to the px range, anything else is dropped. Every write
of a size to CSS goes through `sizeCss`, so a reference never leaks into a
style as `scale:…`. Both the editor (the capability's `typographyVars` and the
mark's `renderHTML`) and the server renderer (`render.server.ts`) call the
same two functions, so the two render a size identically by construction.

The same two forms are accepted at the other boundaries:

- **Agents** (the MCP block schema, `blockInputSchema.server.ts`) pass
  `'scale:<step>'` or a px number; the tool text teaches the steps first.
- **An HTML block's inline style** may set `font-size: var(--type-<step>)` —
  exactly that, from the closed step list; no other `var()` passes the
  sanitizer.
- **A custom style** may read `var(--type-<step>)`; the CSS editor offers the
  tokens ([custom-styles.md](custom-styles.md)).

Per-breakpoint overrides work as for every capability field: a tier's own
size, step or px, overrides the tiers above it
([blocks/capabilities.md](blocks/capabilities.md#the-capabilitycascade-system)). The fluid steps make
that unnecessary for the common case — a large heading shrinking on a phone.

## Paragraph styles

A heading or paragraph block is set in one **paragraph style**:
the one control, in the toolbar, for what the block *is* and how it *looks*.
A style bundles

- the element it renders as — `p`, or `h1`…`h6`;
- a base role, hidden from the UI, naming the built-in look it starts from
  (the table under [Roles](#roles-and-their-built-in-looks));
- an optional typography token, whose set fields lay over that look.

Styles are defined under `/settings/branding`, in the Paragraph styles table of
the Typography section (name · render as · token · default; add and edit in
a modal). The seeded set is one default per element plus two extra looks,
named in English and German:

| Style | In German | Renders as | Base role |
|---|---|---|---|
| Body text | Fließtext | `p` | body |
| Title | Titel | `h1` | h1 |
| Subtitle | Untertitel | `h2` | h2 |
| Heading 3 … 6 | Überschrift 3 … 6 | `h3` … `h6` | h3 … h6 |
| Display | Display | `h1` | display |
| Label | Label | `p` | label |

**A style's name is localized text**, like a schema label
([languages.md](languages.md#schema-labels-are-localized-text)): `paragraph_styles.label`
holds one string per language, the modal edits every enabled language with
the one localized field (the site default language required), and the table
marks a style whose name lacks one. Every reader resolves it for the
request's interface language: the editor's picker through the registry
(`getParagraphStyles`), the settings table, MCP's `list_paragraph_styles` (`label`,
and every translation as `labels`). A name is unique within each language.
What identifies a style is its id, its element and its base role — never the
name: content and agents name a style by its id.

**Exactly one style per element is the default.** It is what a bare element
resolves to: Enter after a heading, a markdown `#`, a heading shortcut, an
agent's bare `level` — each sets only the element, and the element's default
style supplies the look. The default toggle in the table swaps within an
element; a default cannot be deleted until another style has taken its place
(the seed covers every element, so one always exists). A style's element is
fixed at creation, because content keeps its own element (next section); its
label and token may change freely.

### How a style is stored and resolved

The document model stays heading/paragraph. A style is an additive
`paragraphStyle` attribute on the node, holding the style's id (`data-paragraph-style`
in HTML); a heading's `level` stays its tag. Choosing a style is one compound
command (`applyParagraphStyle`, `capabilities/typography/paragraphStyles.ts`): every
heading and paragraph in the selection becomes the style's element and
records its id, keeping its block id, typography values, text and marks. A
block whose parent cannot hold the element (a paragraph in a list item asked
to become a heading) is left as it is.

At render, `resolveParagraphStyle` — the same function in the editor's
`renderHTML` and in the server walker — decides which look a block falls back
to, in this order:

1. the style its `paragraphStyle` names, if it still exists and renders as the
   block's own element (Tiptap copies attributes across node types, so a
   paragraph style's id can sit on a heading — the element wins);
2. for content from before styles existed, a `typographyRole` override
   (`display` or `label`) resolves to the style with the same element and that
   base role, and otherwise falls through;
3. the element's default style;
4. with no styles at all, the base role's built-in look.

The element is always the node's own: a style never changes a block's tag at
render. So a deleted style, an unknown id or a legacy override with no
matching style all land on the element's default, and no content is ever
rewritten. That is also why the sanitizer needs no rule for the attribute:
like the custom-style mark's id
([custom-styles.md](custom-styles.md#applying-a-style)), it is only ever a
lookup key.

**The look reaches the block by rule.** Both renderers name the *resolved*
style on the element (`data-ps="<id>"`, `paragraphStyleAttribute`; the stored
attribute stays `data-paragraph-style`, the editor's paste round-trip), and the
theme stylesheet holds one rule per style that sets its `--typography-*-d`
vars on that selector (`emitParagraphStylesCss`, emitted with the capability
defaults — [theming.md](theming.md#site-theme)): the body look on every
typography host, the built-in element looks as the floor a block with no
registry falls to, then the styles. A block set entirely in its style
therefore carries nothing inline; `typographyVars` emits only the block's own
values that deviate from the look — at desktop against the look, at tablet
against desktop's effective value, at phone against tablet's
([blocks/capabilities.md](blocks/capabilities.md#capability-defaults)). A block that carries typography
without being a heading or paragraph — a grid or flex cell, a link card —
takes the default paragraph style's look (`bodyDefaults`), through the same
base rule.

Enter at the end of a styled block starts a paragraph in the paragraph
default (`paragraphStyle` is not kept on split); the block's own typography
values still carry over, as every capability's do. Splitting a block in the
middle keeps its style on both halves.

The registry reaches the two render paths the way fonts and named styles
do: the browser holds the resolved styles in the module value the root layout
sets (`typographyRegistry.ts`), the server takes them as `renderDoc`'s
`typographyRegistry` option. Both are fed from `getParagraphStyles()`, which
merges each style's token over its base role's built-in look.

### Where it is edited

The toolbar's Paragraph style menu lists every style in hierarchy order —
paragraph styles first, then h1 → h6, the default first within an element —
each drawn in its own look (family and weight as resolved, the size on the
picker's compressed ramp, never `var(--type-*)` outside the canvas) with its
element muted beside it, and a check on the style the selection resolves to.
On a phone the same list is a bottom sheet. It is the only heading-level
control: the block settings panel shows a heading, like a paragraph, as formatted from
the toolbar. Beside it, the Text style picker applies a named inline style
([custom-styles.md](custom-styles.md)) to a run of text — the block look and
the inline look are two axes, and a style's look is never applied as a mark.

Agents pass a style's id as `style` on a heading or paragraph block
(`list_paragraph_styles`, `append_block`); it decides the element and the look,
exactly as the picker does, and a bare `level` gets the element's default.

## Roles and their built-in looks

Every paragraph style starts from a role: `h1`–`h6` and `body` are the
elements' own, `display` and `label` the two extra looks the seeded Display
and Label styles inherit (`roles.ts`). A role's built-in size is a step:

| Role | Default | Other defaults |
|---|---|---|
| `display` | 6xl | semibold |
| `h1` | 4xl | — |
| `h2` | 2xl | — |
| `h3` | xl | — |
| `h4` | l | — |
| `h5` | m | — |
| `h6` | s | — |
| `body` | m | — |
| `label` | s | medium |

Each heading level sits on its own step, so the hierarchy holds at every
size, and the two largest roles are fluid.

Typography branding (`/settings/branding`) lets an admin define named tokens
and assign one to a paragraph style. A token's size is picked from the
scale. A token saved while sizes were px keeps its px value, shown as its own
entry in the size list and posted back unchanged, until someone picks a step.
The token table stores both forms in one text column, with a check
constraint that allows exactly a step reference or a px value from 8 to 96.

A style's token fields lay over its role's built-in look, and a block's own
value lays over both (`getParagraphStyles`, `typographyVars`).

## Picking a size

The size control, in the toolbar, the block settings panel and the phone sheet, is a
`ScaleField` ([design-system/overview.md](design-system/overview.md)): the scale first, then a
custom px entry as the escape hatch. Each step's name is drawn on a
compressed ramp — equal growth per step, from 0.8125rem for xs to 1.625rem
for 6xl (`typeScaleOptions`) — with its real rem size muted beside it. The
steps grow roughly geometrically, so the ramp reads like a log scale: order
and growth stay visible, xs stays legible, and the list stays short enough
for a popover, where real sizes up to 3.75rem would not. Beside it, the block scope's Auto (inherit the style's
default or the tier above) or the mark scope's ∅ (clear) unsets the value;
the hint names what an unset value resolves to by step (`Default: 4xl`).

## Leading

Line height is unitless everywhere — the capability, the mark and the
branding tokens — so it scales with whatever size a block or mark resolves
to. The content's base leading, `1.65`, is one rule on `.canvas-blocks` in
`blocks/canvasContent.css`, which both the public renderer and the editor
shells load, so the editor sets text with exactly the leading readers see.

## Related pages

- [blocks/overview.md](blocks/overview.md) — the capability system and inline marks.
- [theming.md](theming.md) — the scheme tokens; why the scale is not one.
- [design-system/overview.md](design-system/overview.md) — the chrome's own text ladder, and
  `ScaleField`.
- [custom-styles.md](custom-styles.md) — sizes in admin-authored styles.
