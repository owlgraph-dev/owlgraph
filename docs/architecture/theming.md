# Theming

How colour is decided: the scheme tokens, how they reach the page, and the
colour math shared by everything that has to reason about a colour. The
design-system vocabulary itself (what each token is for, contrast bars,
rings) is in [design-system/tokens.md](design-system/tokens.md#tokens).

## Preference vs. pinned scheme — two attributes, never interchangeable

- **`data-color-pref`** is the *viewer's preference* (`system` | `light` |
  `dark`). It is on `<html>` only, set by the server on every page from the
  viewer's cookie (and by the browser when the viewer picks another) — never
  on an element inside the page. Absent, the document is light.
- **`data-scheme`** pins *a subtree* to a scheme (`light` | `dark`): the page
  canvas, a scheme region, an HTML block, the playground. It never goes on
  `<html>`. The playground pins `<body>` rather than its own root, because
  Dialog, Popover, the Select and Combobox lists and the other floating layers
  portal to `<body>` and must render in the scheme of the specimen that opened
  them.

The two compose: a `data-scheme="light"` canvas inside a
`data-color-pref="dark"` document is light, because a scheme block declared
on the nearer element wins by inheritance. Code that asks "what does the
viewer want" reads `data-color-pref`; code that asks "what does this subtree
render in" reads `data-scheme` (or the nearest ancestor carrying it).

## Scheme tokens

> Decision: [0006. Colour schemes are selector blocks, not `light-dark()`](../adr/0006-colour-schemes-are-selector-blocks-not-light-dark.md).

`src/lib/design-system/theme/tokens.ts` holds every custom property whose
value depends on the colour scheme, as one complete set per scheme:

- the chrome's base colours (`--ds-color-bg`, `-fg`, `-muted`, `-border`,
  `-accent`, the tones, `-surface`, `-well`, `-scrim`, …);
- elevation (`--ds-color-raised-modal`, `--ds-color-raised-floating`,
  `--ds-color-border-elevated`) and the selection-indicator companion band
  (`--ds-color-indicator-companion`);
- the data-visualisation palette (`--ds-viz-1` … `-8`, `--ds-viz-other`,
  `--ds-viz-document`), which the graph view colours nodes with;
- the colours derived from them — the interaction steps
  (`--ds-color-accent-hover` / `-pressed`, `--ds-color-fill-hover`, …) mix
  toward `--ds-color-mix-target`, the scheme's own direction for "one step
  deeper";
- page content's palette, `--content-*` (below);
- the focus-ring parts that carry colour (`--ds-focus-ring-color`, the
  composed `--ds-focus-ring`, `--ds-focus-ring-companion`);
- shadows (`--ds-shadow-sm/md/lg`);
- the content-colour filters (`--ds-filter-content-hover` / `-pressed`) for a
  surface whose colour is content rather than chrome — a colour swatch, a
  graph node — where no token fill can stand in for the colour itself.

Everything that does not change with the scheme — spacing, radii, heights,
the text ladder, weights, z-index, opacity, ring width and offsets — stays a
static `:root` token in `src/app.css`. So does page content's type scale
(`--type-*`, [typography.md](typography.md)): a size reads the same in every
scheme.

## The schemes

Two schemes exist, `light` and `dark`. The document is in the scheme the
viewer's preference resolves to (below); a subtree pinned with `data-scheme` is
in its own. A dark value
is the same role stepped for a dark ground, never an inversion of the light
one, and every scheme meets the same bars:

| Pair | Minimum |
| --- | --- |
| `fg`, `muted` on `bg`, `surface`, `surface-modal`, `surface-overlay`, `well`, `fill-hover`, `accent-soft` | 4.5:1 |
| `accent`, `link`, `danger` as text on those grounds except the list highlight, which carries `fg` and `muted` text only; each tone on `bg` and on its `-soft` ground | 4.5:1 |
| `on-accent` on `accent` and `danger`, and on their hover and pressed steps | 4.5:1 |
| `border-strong` on every ground it sits on; the focus ring (`accent`, or `on-accent` on a fill) on its ground | 3:1 |
| content text (`--content-fg`, `-muted`, `-link`, `-doc-link`) on `--content-bg`, the table header and inline code grounds | 4.5:1 |

The design-system a11y spec runs axe, the focus-ring sweep and the
pressed-versus-hover check in both schemes (the playground's `?scheme=dark`),
so a value that misses a bar fails there.

What dark changes beyond the values themselves:

- **Fills carry dark text.** Accent, link and danger must read as *text* on
  every dark ground, which makes them light — so a primary or danger button's
  label and a filled control's focus ring (`on-accent`) are dark.
- **Elevation is lightness.** A shadow barely reads on a dark ground, so each
  level is a step lighter than the one below: the page (`bg`), a modal
  (`surface-modal`: Dialog, BottomSheet, the search overlay, the editor
  block settings panel sliding over the canvas on a phone), a raised control or a toast
  (`surface`), a floating layer (`surface-overlay`: Popover, DropdownMenu,
  NavigationMenu, Tooltip, the Select, MultiSelect and Combobox lists, the
  graph's panel and node card) — each with the `border-elevated` hairline.
  Dark shadows are deeper and tighter and only add depth. In light the
  elevation grounds equal the page and the shadow carries the level, so a
  primitive always reads the token for its level.
- **Hover moves toward white.** `--ds-color-mix-target` is white, so a filled
  control lightens on hover and pressed; the content-colour filters brighten
  instead of darkening.
- **The list highlight is its own step.** Light derives `fill-hover` from the
  border and the page; a floating layer in dark is lighter than the page, so
  dark sets the highlight (and `fill-pressed`) explicitly, a step above the
  floating ground.
- **The graph palette is re-stepped.** The eight categorical hues keep their
  order; each scheme's steps are validated as a set on that scheme's page
  ground (lightness band, chroma floor, adjacent colour-vision-deficiency
  separation, normal-vision floor, contrast).

**A scheme set is always complete.** A custom property whose value contains
`var()` is substituted where it is *declared*. A derived token declared only
at the root would therefore keep the root scheme's value inside a subtree that
redefines the base colour. Every scheme block declares the whole set —
derived and alias tokens included — and the emitter is the only thing that
writes one.

## The viewer's preference

A viewer chooses *System*, *Light* or *Dark* under Profile → Appearance. Like
the interface language it is a device preference, not an account attribute: a
cookie (`color_pref`, a year), never a column on the user row
(`src/lib/design-system/theme/preference.ts`).

- **On the server.** `hooks.server.ts` resolves the cookie
  (`resolveColorPref`: a known value, else the default) into
  `locals.colorPref` and writes it into `app.html`'s `data-color-pref`
  placeholder, so the page is in its scheme from the first byte — no script,
  no flash. The root layout renders two `theme-color` metas, one per device
  scheme, each with the colour the preference resolves to there.
- **In the browser.** The Appearance row calls `applyColorPref`, which writes
  the cookie and updates `data-color-pref` and the metas at once, without a
  reload. From then on the attribute, not the root layout's data, is the
  truth: the layout load does not rerun on client-side navigation, so
  anything that shows the current choice reads `currentColorPref()` in the
  browser and uses `locals.colorPref` only on the server.
- **The browser's chrome.** The two `theme-color` metas carry the app bar's
  background where the site theme brands it, else the page ground
  (`appbarColors`, `themeColors`).
- **The default.** A viewer who never chose — every anonymous visitor
  among them — gets `DEFAULT_COLOR_PREF`, `system`: the scheme their device
  is set to. A page pinned light (the site's default for pages until an admin
  lets them adapt, below) keeps its light reading area inside a dark shell.

## Content scheme

A page's content renders in its **content scheme**, independent of the shell:

- **`light`** or **`dark`** pins it — every reader sees that scheme, whatever
  their own preference;
- **`adaptive`** follows the reader: the page renders in whichever scheme the
  reader's document is in.

A page stores its choice in `pages.content_scheme`, or null to inherit.
`resolveContentScheme` (`features/content/color/contentScheme.ts`) walks page →
namespace → site: the namespace slot is part of the chain but not settable,
and the site default is the `content_scheme_default` setting
(`getContentSchemeDefault`, set under Settings → *Colour scheme*), which
reads as `light` while unset. So every page renders on a light canvas until
an author or the site says otherwise, and a page authored with
light-assuming colours reads as authored.

The resolved scheme becomes the canvas's `data-scheme` via `canvasScheme`: the
scheme itself when pinned, nothing when adaptive (the canvas then inherits the
document's scheme). Every canvas carries it — `RenderedContent` on a page and
a share link, the desktop and phone editor. On a page route the root layout
pins the reading area around it too (`main.canvas-route`, which grows to the
footer, painting its ground), so a pinned page sits on its own scheme from
the app bar down rather than in a box ending mid-screen. That area paints the
canvas's own ground — the page's background, else the content ground — so a
canvas capped narrower than the window shows no seam beside it. App chrome stays
outside that pin: the app bar, the footer, and the utility sidebar with its
edge tab (the local graph) are rendered by the root layout rather than by the
page, so they follow the viewer's scheme beside a page that pins its own. The
editor frame, toolbar, block settings panel and every floating layer stay in the
viewer's scheme.

Where it is set and read:

- **Editor.** More → *Colour scheme* opens a dialog: *Site default (…)*,
  *Light*, *Dark*, *Adapts to the reader's scheme*. Choosing or inheriting
  adaptive runs the readiness check (below) on the live document. An adaptive
  page is previewed in the canvas in light or dark with the toolbar's sun and
  moon toggle, starting in the author's own scheme; a pinned page shows its
  scheme and has no toggle. The phone editor shows the resolved scheme and
  an adaptive page in the author's scheme.
- **API.** `PATCH /api/pages/:id` takes `contentScheme` (`'light'` | `'dark'`
  | `'adaptive'`, or null to inherit; anything else is a 400). The MCP tool
  `get_page` reports the stored value and `set_page_content_scheme` sets it;
  GraphQL's `ContentNode.contentScheme` is the resolved scheme (null for a
  document).

**Diagrams.** Mermaid draws with concrete colours, so a diagram takes the
content palette as rendered at its own place (`mermaidTheme.ts`: Mermaid's
`base` theme, the palette's computed values and the computed font there —
label sizes are measured in that font; a diagram in a scheme region takes
the region's) each time it is drawn, and is drawn again when its canvas
changes scheme: on the editor's preview toggle or a newly applied scheme,
and on an adaptive public page when the device's scheme or the viewer's
preference changes. Both send the `content-scheme-change` window event; the
diagram listens for it. A drawing stays until the next one replaces it.

The drawing happens in the **render frame**, in the editor and on the page
(`diagram/mermaidFrame.ts`): Mermaid inserts a `<style>` into every SVG,
sets style attributes and re-inserts its markup with `innerHTML`, all of
which the page's strict `style-src` refuses
([architecture/overview.md](overview.md#content-security-policy)). So the diagram
block's component (`Diagram.svelte`, a page island —
[blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)) uses one invisible same-origin
iframe of `/api/embed/mermaid` per document — a route whose own policy allows
inline styles and which only this origin may frame — and posts its source and
palette to it. The frame draws, turns every style attribute into a class
scoped to the diagram's id and lifts the SVG's stylesheet out, and answers
with markup that carries no style attribute plus the stylesheet text. The
component inserts the markup, then a `<style>` under the document's nonce,
inside the SVG. The frame draws one diagram at a time: Mermaid applies its
configuration at once but queues its drawing, so two diagrams drawn together
would share the palette that arrived last. It is laid out off screen rather
than hidden: a document that is not laid out measures every label as empty.
The editor, whose route would allow inline styles, draws the same way, so it
shows exactly what the page will and never loads Mermaid itself.

Until it is drawn, a diagram says so — "Rendering diagram…", in the
interface language — in the editor and on the page. The page renders that text on the
server and never shows the source, which reaches the island in its props, so
a diagram that is never drawn (no script, a page printed before it scrolled
into view) shows the text. A diagram that cannot be drawn shows Mermaid's
message after "Diagram error"; an empty one shows nothing on the page and a
hint in the editor.

A diagram is drawn when it comes within a screenful (`whenVisible.ts`), on
the editor and the page: Mermaid lays each one out in the main thread, so a page of
diagrams would otherwise stall on load and again on every scheme change.
One already in view is drawn at once, so nothing waits for a scroll that
isn't needed.

## Adaptive readiness

An adaptive page renders its default ground and text from the content palette,
which changes with the scheme — and so does every theme colour an author
references, while a literal stays fixed. `checkAdaptiveReadiness(doc)`
(`features/content/color/adaptiveReadiness.ts`, pure) walks the document on the
grounds the renderers decide scheme regions from (below) and measures, once for a
light and once for a dark page, every place a colour meets a ground:

- a **text** colour — a block's Typography colour, an inline colour mark, or
  the default text a block's background sets — below 4.5:1 against its
  ground;
- a **border** below 3:1 against the ground around its block;
- an **HTML block** with inline `color` or `background` styles that doesn't
  pin a scheme (below): its colours cannot adapt, and nothing gives them the
  ground they were picked for;
- a **background image** with neither an overlay nor a scheme: it keeps the
  page's scheme, so its text turns from dark to light over a photo that stays
  the same ([Scheme regions](#scheme-regions)).

A pair that comes out the same for both page schemes is not flagged: a
literal on a literal background, a theme colour or the default text inside a
scheme region. Whether such a pair reads is an authoring question the block settings panel's
contrast guidance answers, not something adapting changes. A theme colour is
resolved in the scheme of the place it is painted — inside a dark scheme region, the
dark scheme's value for both page schemes. Grounds are resolved per
breakpoint, the way the renderers cascade them, so a background set only from
tablet leaves desktop on the page ground. A translucent colour is composited
over its ground before measuring.

Each finding names the nearest block with a `blockId`, the colour, the scheme
it fails in, its weakest ratio and the breakpoints it fails at. The editor
runs the check on the live document and lists the findings in its *Colour
scheme* dialog with a *Show* action that selects the block; the settings
report runs it over every page (below). Findings never block the choice.

## Letting pages adapt

Settings → *Colour scheme* (`/settings/color-scheme`, `branding:manage`) sets
the site default for pages: *Light*, *Dark*, or *Adapts to the reader's
scheme*. Light and dark apply at once. Adapting is the step that exposes
light-assuming pages to dark readers, so it goes through a checklist first:

1. **The readiness report.** Every page that follows the default and that the
   admin can read, run through the readiness check
   (`features/pages/readiness.server.ts`), the pages with findings listed with
   their counts, a link into the editor and a dark preview. *Keep these pages
   light* pins every listed page to `light` in one action — only pages the
   admin can edit, and only while they still follow the default — so a later
   change of default leaves them as they are.
2. **The palette.** The content palette's own pairs meet their minimums in
   both schemes (`themeColorShortfalls`, `features/content/color/themeColorContrast.ts`):
   text, muted, link and accent on the page ground, the strong border at 3:1,
   and every theme colour's readable partner on it — except the strong border
   as a ground, a mid-tone line colour on which no text reads in every scheme.
   The built-in schemes pass; the server refuses *adaptive* while any pair
   fails, checked against the stored site theme at the moment of the choice.
3. **HTML blocks with inline colours** that pin no scheme, counted from the
   report, which cannot adapt.
4. **A preview.** A page's URL with `?scheme=dark` (or `light`) renders it as
   it reads once it adapts, for a reader in that scheme (`previewScheme`); it
   changes nothing but colours, so it needs no permission. The checklist links
   a sample: the pages with most findings, else the first few.

The choice is reversible, and pages with a scheme of their own are unaffected
either way.

The e2e spec that switches the default (`color-scheme-settings.spec.ts`)
runs as its own Playwright project after every other spec, so no spec
running beside it sees a changed default.

## Colour references

A colour an author sets on content — a Surface background or border, a
Typography colour, an inline colour mark — is stored as one of two things:

- a **literal** (`#1e293b`, `rgb(…)`, `rgba(…)`): that exact colour, the same
  in every scheme;
- a **theme colour reference**, `token:<name>`, from a closed registry
  (`features/content/color/colorTokens.ts`): *text*, *muted*, *border*,
  *border-strong*, *background*, *subtle*, *accent*, *accent-soft*,
  *on-accent*, *inverse*, *on-inverse*, and *info*, *success*, *warning*,
  *danger*, each with a *-soft* ground. It renders as
  `var(--content-theme-<name>)`, a scheme token defined for every scheme,
  so it follows the scheme the content renders in. *inverse* is the text
  colour used as a ground, with *on-inverse* as its text — a band that is
  dark on a light page and light on a dark one;
- a **brand colour reference**, `token:brand.<id>`, to one of the site's
  brand colours (Site theme): `var(--content-brand-<id>)`, a value per scheme,
  its readable text beside it.

`safeColor` accepts these (and nothing else), so a stored reference is
validated like a literal; `colorCss` turns a stored value into CSS at every
point a colour reaches a style — the Surface and Typography custom
properties, an inline colour mark in the editor and on the published page,
a table header tinted from its table's background. `safeLiteralColor` is the
literal-only form, for a colour that is computed with rather than only
painted (the footer's background, from which it picks readable text).

`readableOn(name)` is a theme colour's readable partner: *on-accent* on the
accent and the four strong tones, *on-inverse* on *inverse*, *text* and
*muted*, *text* on every soft, mid-tone or page-strength ground. A block
filled with a theme colour takes it as its default text (the Surface
capability's `--surface-fg-*`, below), so a quick link in its *button*
variant — filled with the accent by default, or with the site's cards default
([blocks/node-embeds.md](blocks/node-embeds.md#quick-link-variants)) — reads in both schemes.

The colour pickers (`ColorField` and `ColorPickerField` with `themeColors`)
list the theme colours first, in their own labelled group, painted from the
viewer's scheme, then the custom palette and the free picker; a picked
reference is shown by name. Theme colours are what the MCP tools teach
agents to use first, with the pairs above. The theme colours follow the
site's scheme tokens; a callout's local accent does not reach a referenced
*accent*, which always means the site's.

## Scheme regions

A literal background is fixed: the same colour in every scheme. A block that
paints one is a **scheme region** — it pins the scheme its subtree renders in with
`data-scheme`, so the default text, links, borders, theme colours and
design-system primitives inside it all resolve against a scheme that reads on
that ground, whatever the page around it does. An author's own text colour
still wins.

`features/content/color/schemeRegions.ts` decides it, never from the literal's luminance
alone:

1. **Effective ground.** An opaque literal is its own ground. A translucent
   one is composited over what it sits on: the ground of the nearest ancestor
   with a background, else the page ground — the page's own background when
   it sets one ([blocks/layout.md](blocks/layout.md#page-settings), a theme colour resolved
   in each scheme; `pageGrounds`), else the content ground — once for each
   scheme the page can render in.
2. **Pick by contrast.** The scheme whose text colour (`--content-fg`)
   contrasts more with the effective ground wins. A saturated blue or a mid
   grey is decided by which text actually reads better on it.
3. **Translucent grounds that disagree.** When compositing over the light and
   the dark page ground picks different schemes, the block is no scheme region: its
   ground genuinely changes with the scheme, so it inherits the page's.

A theme-colour background is never a scheme region — it follows the scheme by
construction. A table's own background is not a ground at all: it shows only
in the gaps between cells, which paint their own.

**An image ground** ([blocks/capabilities.md](blocks/capabilities.md#background-images)) has no one
colour, and its pixels are never read. What sits under text there is the
overlay over *some* pixel; every pixel lies between black and white, so the
grounds the text can meet are the overlay over black and over white — and,
around a contained image, over the colour fallback. Text is judged by the
worse of them (`imageFillOver`):

- **Scheme on the image** set to *Light* or *Dark* pins that scheme, overlay
  or not.
- **Auto with a literal overlay** picks, as for a colour, the scheme whose
  text reads better — on the worst of those grounds. A dark overlay gives a
  dark scheme region and light text.
- **Auto with a theme-colour overlay** pins nothing: the overlay changes with
  the scheme (*inverse* is dark on a light page, light on a dark one), so like
  a theme-colour background its default text is the colour's readable partner
  (`imageTextProperty`).
- **Auto with no overlay** keeps the scheme around it, on a ground nothing can
  measure (`unknown`): nothing on it is measured, and the block settings panel and the
  readiness check say so instead.

The default text on an image is that scheme's text colour or the overlay's
partner — never the colour fallback's partner, which is not what the text
sits on.

**Default text.** Every Surface background sets the default text on it,
`--surface-fg-{d,t,p}` beside `--surface-bg-*` (`surfaceVars`,
`fillTextProperty`): a theme colour's readable partner, or on a literal the
text colour of the scheme its region pins — `--content-fg`, and for a
quick link `--content-filled-fg` (white in dark, the text colour in
light), which a button card filled with an old preset's literal blue keeps as white text. `.cap-surface`
sets `color` from it, and a Typography colour falls back to it, so a cell
with a background no longer inherits the page's text colour. Being plain
custom properties, these need no knowledge of the block's ancestors; the
scheme attribute does.

**Breakpoints.** The decision runs per breakpoint on the cascaded
background. A block that is the same scheme region everywhere carries `data-scheme`;
one whose region differs carries `data-scheme-d`, `-t` and `-p` on the
breakpoints that are one, each applied only within its breakpoint's canvas
width (see Emission).

**Editor and page agree.** The public renderer decides scheme regions on its way
down the document (`renderDoc` hands each block renderer its attributes via
`ctx.schemeAttributes`); the editor applies the same attributes as node
decorations (`SchemeRegions`, `color/schemeRegionDecorations.ts`), which
ProseMirror sets on a block's outermost element whether it renders through
`renderHTML` or a NodeView. Both walk with `groundStep`, and a unit test and
an e2e spec compare the two.

**Pinned by the block itself.** Two blocks carry a scheme an author sets
directly, rather than one decided from a background (`pinnedScheme`,
`features/content/color/contentScheme.ts`: `light`, `dark`, or null to follow the
page):

- **An HTML block's `scheme`.** Inline colours in HTML can never follow a
  scheme, so the author pins the one they were picked for. The block renders
  with `data-scheme` on its element (the block wrapper, `div.html-block`
  around the html, in the editor and on the page) and on that scheme's
  content ground and text (`canvasContent.css`), whatever the page's scheme.
  The block settings panel's *Colour scheme* row sets it; the block input (API and MCP
  `append_block` with `kind: 'html'`) takes `scheme`. A pinned HTML block is
  no readiness finding.
- **An image's `backdrop`.** A transparent image (a logo, a diagram exported
  without a ground) can show a ground behind it: the pinned scheme's
  `--content-bg`, painted by the `<img>` itself, which carries `data-backdrop`
  and `data-scheme` — having no children, nothing else takes the scheme. The
  block settings panel's *Backdrop* row sets it.

## Contrast guidance

The editor warns under a colour field when the colour it sets — or the
default text a background leaves — doesn't reach 4.5:1 where it sits, in the
schemes the page renders in (both for an adaptive page, else the pinned one),
at the breakpoint being edited (`features/content/color/contrastGuidance.ts`, on
the scheme regions' grounds):

- under *Background*: the default text on it, or — when the background is a
  scheme region and even the better text colour misses — "neither default text
  colour reads on this background; set a text colour";
- under *Scheme on the image*: the same for a background image, measured on
  the worst ground its overlay leaves — or, with neither an overlay nor a
  scheme, that what sits under the text depends on the image;
- under a Typography colour: the block's colour on its own ground;
- under an inline colour: the selected text's colour on the ground of the
  block holding it.

A warning names the scheme it fails in when only one of two fails. It is a
`FieldWarning`: the value stays valid and can be kept.

## Content palette

Authored pages read `--content-*`, never `--ds-*`: the canvas ground and text
(`--content-bg`, `--content-fg`), `-muted`, `-border`, `-link`, `-accent` and
`-accent-soft`, the table cell and header grounds (`--content-raised`,
`--content-table-header`), text on a quick link filled with a literal
(`--content-filled-fg`, read inside the fill's scheme region), inline and block code (`--content-code-bg`,
`--content-pre-bg` / `-fg`), document links (`--content-doc-link`), the
notice tones (`--content-warning` / `-soft` / `-border`, `-success`,
`-danger`, each with a soft ground), `--content-mix-target` for derived
colours, and the Surface capability's shadow presets
(`--content-shadow-sm/md/lg`).

Most default to the chrome colour of the same role, but they are a separate
layer on purpose: a page can render in a scheme the shell is not in, and a
site theme can give content its own values. The page canvas (`.page-canvas`)
sets its ground and text from the palette, so everything inside a page —
block stylesheets, `RenderedContent`, the editor's canvas — resolves against
it.

Style values a block *emits* follow the same rule. The Surface capability's
shadow presets are `var(--content-shadow-*)`, a table header tinted from its
table's background mixes toward `var(--content-mix-target)`, and an untinted
header is `var(--content-table-header)` — so a stored preset follows the
scheme it renders in. A colour an author picks is different: it is stored as
the literal they chose and stays that colour.

A block may redefine a content token for its own subtree. A callout variant
sets `--content-accent` and `--content-accent-soft` to its tone, and a
quick link inside it takes that colour: rules read the content token
directly, so the redefinition reaches them. What does *not* carry is a
redefinition of the token a content token defaults to — `--content-accent`
is `var(--ds-color-accent)` substituted where the scheme block declares it,
so setting `--ds-color-accent` on a subtree leaves `--content-accent`
unchanged. Redefine the content token itself.

A state painted over content — the row under the pointer in an editor's
listing, a quick link card under the pointer — is a tint of the element's own
text colour (`color-mix(in srgb, currentColor 8%, transparent)`), never a
scheme token. The text is whatever reads on the box's fill, so a tint of it
reads too, on any fill; a scheme's surface would not, since a theme-colour
fill is no scheme region: the surface stays the page's while the text turns the
fill's partner (light text over a white row, on *Inverse* on a light page).

A design-system primitive inside content is a control, never a surface — a
block's navigation, its "load more", a file's download, an editor action — so it reads `--ds-*`
like the rest of the chrome; inside a scheme region it takes the region's
scheme, since the region declares the whole set ([blocks/anatomy.md](blocks/anatomy.md#svelte-leaf-blocks)).

## Emission

`src/lib/design-system/theme/emit.ts` turns the sets into CSS:
`emitSchemeCss(schemes)` writes one block per scheme, each opening with its
`color-scheme` (so native controls and scrollbars follow) and declaring the
full set:

- light: `:root` and `[data-scheme="light"]`;
- dark: `:root[data-color-pref="dark"]` and `[data-scheme="dark"]`;
- dark again inside `@media (prefers-color-scheme: dark)` for
  `:root[data-color-pref="system"]`;
- light and dark once more for each breakpoint's scheme attribute
  (`[data-scheme-d="…"]`, `-t`, `-p`), inside `@container canvas` with that
  breakpoint's width as an exclusive range — wider than 900px, 641–900px, up
  to 640px — so exactly one of a block's three can apply.

A preference selector outranks the bare `:root` (two conditions against one),
so the preference wins on `<html>` whatever the block order; a pinned subtree
declares its own set on its own element and wins by inheritance.

The root layout (`src/routes/+layout.svelte`) injects the site's sets into
the document head, so the tokens exist on the server-rendered page before
first paint and on every client-side navigation after: `compileTheme` resolves
the site theme (below) over the built-in sets and emits them, cached by the
theme's version — once per version per process, never per request. The
layout's data carries only the stored theme, a few kilobytes of JSON, and the
version; server and browser run the same pure resolution, so the emitted text
is identical on both sides. `DEFAULT_SCHEME_CSS` is the built-in sets alone.
The emitted sheet opens with the cascade-layer order and sits in the `theme`
layer ([design-system/tokens.md](design-system/tokens.md#cascade-layers)); the `<style>`
element carries the response's style-src nonce, as every inline style element
the layout renders does ([architecture/overview.md](overview.md#content-security-policy)).

Token names are checked as they are emitted too (`--` and word characters
only), since a theme adds names of its own.

**Print is always light.** Paper is white and browsers drop backgrounds when
printing, so a dark document — or a dark scheme region inside a light one — would
print light text on white. A `@media print` block gives the light set to the
root and to every element that pins a scheme (`[data-scheme]` and the
per-breakpoint attributes), which is the only way to reach a pinned subtree:
it declares its own set on its own element. For the same reason paper gets no
background image (`app.css`): a dark hero's region prints light, and dark text
on the photo — the overlay that made it read is dropped with it — would not. The app chrome — the app bar, the
footer, the settings sidebar, the graph panel — is hidden in print
(`app.css`), so an exported article is the content alone.

Values are checked as they are emitted: one that could close its
declaration, the rule or the `<style>` element (`;`, `{`, `}`, `<`, `>`) is
an error, not something to escape.

## Site theme

What an admin brands — Settings → Branding, *Colours* and *Logo for dark* —
is the site theme: one row of `themes` (`scope_kind = 'site'`), a sparse
JSON document resolved over the built-in sets
(`design-system/theme/siteTheme.ts`; storage and validation in
`features/site/theme.server.ts`). Absent keys inherit; a stored document that
fails validation reads as no theme.

```ts
{ version: 1,
  accent?: '#rrggbb',                                   // the brand accent
  schemes?: { light?: { accent? }, dark?: { accent? } }, // hand-set per scheme
  brand?: [{ id, name, light, dark }],                  // named brand colours
  logoDarkAssetId?: uuid,                               // the dark-scheme logo
  blockDefaults?: { page?: { blockSpace?, widths?: { read?, wide?, max? },  // capability defaults,
                           gutters?: { desktop?, tablet?, phone? } },         // canvas widths
                   groups?: { containers?: {…}, … } } }                       // and gutters
```

**Capability defaults** ("Block defaults") ride on the same document: an
admin's explicit picks per block-type group — padding, radius, shadow, border,
background, rhythm — as steps and theme-colour references only, sparse over
the built-ins, and the page's canvas widths in px and gutters as steps (the
width and gutter tokens, re-declared on `:root` only when moved). They are the block model's concern, not colour's: resolved and
emitted by `features/content/capabilities/defaults` into the content half of
the theme stylesheet (`compileContentTheme`, cached per theme version beside
`compileTheme`), which the root layout injects into the same `<style>` — the
per-group `--default-*` rules and the paragraph styles' looks
(`emitParagraphStylesCss`). The site theme's cache version covers both, so a
saved default reaches every render that follows. What the defaults mean and
how a block resolves against them is in
[blocks/capabilities.md](blocks/capabilities.md#capability-defaults).

**The accent.** One brand colour gives each scheme its accent: the colour
itself where it meets that scheme's accent bars, else the colour of the same
OKLCH hue and chroma whose lightness is nearest the brand's that does
(`generateAccent`). The bars (`accentShortfalls`): the accent as text at
4.5:1 on the page, surface, modal and floating grounds, the well, and its own
soft tint; text and muted text at 4.5:1 on the tint; on-accent at 4.5:1 on
the accent fill and its hover and pressed steps (which covers the focus
ring's 3:1). The soft tint is generated beside it, a near-page lightness of
the hue; link follows the accent; hover, pressed, the soft-pressed tint and
the focus ring already derive from the accent in CSS. The built-in light
accent reaches 4.37:1 on the list highlight (`fill-hover`), where accent text
doesn't sit — only `fg` and `muted` do — so that ground is not among the
bars. An admin may set either
scheme's accent by hand instead; one that misses the bars is refused on save,
naming the pairs that miss, and the settings page shows the same as it is
picked. `--content-accent`, `-link` and the content palette's accent follow
the chrome's.

A brand colour is paired with whichever of the page's text and ground reads
better on it; a mid tone leaves neither at 4.5:1, which the settings say under
the colour rather than refuse — a band with its own text colour is a fair use
of one.

**Brand colours** have a stable id, a name and a value per scheme. Each
becomes `--content-brand-<id>` in its scheme's set, with
`--content-brand-<id>-fg` beside it — whichever of that scheme's page text and
page ground contrasts more with it. Content references one as
`token:brand.<id>` (Colour references): the colour pickers offer the site's
brand colours at the head of their Theme group (`getBrandColors`, set by the
root layout), a block filled with one takes its `-fg` as default text, and a
renamed colour stays on every page that uses it; a reference to a removed
colour renders as nothing. Agents list them with the MCP tool
`list_brand_colors`.

**The app bar's background** is a colour per scheme (`appbar: { light, dark }`).
The bar holds controls, not just text, so a branded bar re-points the
interface tokens on itself — text, muted text, the active item, the focus
ring, the hover and pressed fills, the border, and which logo shows — each to
the colour that reads on the bar or a step of it, and every control inside
inherits them without knowing the bar is branded. A floating layer one of them
opens portals to the body and keeps the page's colours — except the nav
menu's submenu, which anchors to its own trigger and so renders inside the
bar: it takes the page's values back through `--ds-page-*`, a second name for
the page's own colours that a band never overrides. Unset for a scheme,
every one of those tokens resolves to the interface's own, so the bar is
exactly the plain one. The browser's own chrome (the `theme-color` metas)
follows the bar when it is branded, since it sits directly above it.

**The footer's background** is a colour per scheme (`footer: { light, dark }`),
set under Branding beside the accent — a branding concern, not a footer one.
Each scheme's set gets `--ds-footer-bg`, `--ds-footer-fg` (whichever of that
scheme's interface text and page ground reads on the background) and
`--ds-footer-border` (a step of that text into it); `Footer.svelte` reads them
and falls back to the plain footer where a scheme has none, so nothing is
pinned and each scheme's footer stands on its own. A footer's link and focus
ring colours follow its text rather than the accent, which isn't checked
against an arbitrary ground.

**The dark logo** is an asset like the logo (`kind = 'logo'`, served by the
same public route). When the site has one, `Logo.svelte` renders both and the
scheme tokens `--ds-logo-light-display` / `--ds-logo-dark-display` show one —
so the logo follows the scheme of wherever it sits, preference or pinned
subtree.

**The built-in mark**, shown while the site has no logo of its own, is one
colour: `currentColor`, which `Logo.svelte` sets to `--ds-color-fg`, so it
takes the theme's text colour and, on a branded app bar, the bar's. The
project's own brand colours are never theme tokens; the app stays neutral and
an admin's theme decides. The mark has two cuts, the full mark at 32px and up
and a small cut below, and the mark's own box is the container query that
picks one, so a size change anywhere picks the right cut. Every size the app
draws it at takes the full mark, whose strokes match the 2px icons beside it.

**Colour reasoning follows the theme.** `resolveSchemeValue` resolves against
the active sets (`setActiveSchemes`, `tokens.ts`): the built-in ones until the
site theme is known, then the site's — set by the root layout in the browser
and by `getSiteTheme` on the server. One site has one theme, so a module value
serves every request; the readiness report's route awaits the root layout's
load so the theme is set first. Scheme regions, contrast guidance, the readiness
check and the palette check therefore measure brand colours and a branded
accent as they render.

**Preview.** The Colours settings show the interface and a page in both
schemes from the unsaved draft: each preview panel pins its scheme and
redefines that scheme's resolved set on itself (a scoped scheme block, one
class more specific than the site's).

**Namespaces later.** `scope_kind = 'namespace'` rows with a `scope_id` are
reserved by the table's constraints; a namespace theme will resolve over the
site's, emit under a namespace wrapper selector, and be handed to colour
reasoning explicitly rather than through the active sets. The site's other
registries sit on the same scope model — its custom styles
([custom-styles.md](custom-styles.md)) and its page layouts
([blocks/layout.md](blocks/layout.md#page-layout-sections)). A page layout is structure
only and leaves every visual value Auto, so a page on any layout follows the
theme: retuning how pages look is the theme's and the block defaults' job, never a
layout's.

## Colour math

`src/lib/design-system/theme/color.ts` is the one place colour is reasoned
about rather than painted, dependency-free so the editor, the public renderer
and server code compute identical answers:

- `parseColor` reads the syntaxes stored content can hold — `#rgb`, `#rgba`,
  `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` in comma or space syntax — and
  returns `null` for anything else (named colours, `hsl()`, `var()`).
- `composite(top, bottom)` lays a translucent colour over an opaque ground.
  Contrast is only meaningful for opaque colours, so a translucent colour is
  composited over the ground it sits on first.
- `relativeLuminance` and `contrastRatio` are the WCAG 2 definitions.
- `toOklch` / `fromOklch` convert to and from OKLCH (lightness, chroma, hue),
  the space accent generation steps lightness in; `fromOklch` reduces chroma
  to bring an out-of-gamut colour on screen. `mixSrgb` is what
  `color-mix(in srgb, …)` paints; `toHex` writes `#rrggbb`.
- A text colour for an arbitrary ground is chosen by comparing the contrast
  of candidates, never by a fixed luminance threshold, which misjudges
  saturated mid-luminance grounds.

`readableScheme(ground, textProperty)` (`theme/readableScheme.ts`) applies
that to the schemes: the scheme whose text colour — a scheme token, such as
`--content-fg` or `--ds-color-fg` — contrasts more with a fixed ground. It
decides a scheme region, and the site footer's scheme: on an admin-chosen
background the footer pins the scheme that reads there (`footerScheme`), and
its text, links, dividers and focus rings all come from it — the text colour
throughout, since muted and accent aren't checked against an arbitrary
ground.

## Related pages

- [design-system/overview.md](design-system/overview.md) — what each token is for, the contrast bars, the rings.
- [custom-styles.md](custom-styles.md) — admin-authored CSS for content, which reads the `--content-*` palette and is confined to the page canvas.
- [settings.md](settings.md) — where an admin sets the site theme.
