# Building UI

owlgraph's chrome (everything that is not authored page content) is composed
from the primitives in `src/lib/design-system/` and the `--ds-*` tokens
(colour: `src/lib/design-system/theme/tokens.ts`; the rest: `src/app.css`).
This guide is the procedure: what to do, in what order. The reasons behind
every rule are in the [design system](../architecture/design-system/overview.md)
— read the sections you touch, don't re-derive them, and don't reopen decided
conventions.

**Follow it when** the change adds or edits a `.svelte` file under
`src/lib/features`, `src/lib/shell`, `src/lib/design-system` or `src/routes`,
touches `src/app.css` or the scheme tokens, or changes user-visible strings.

## Procedure

Work through these in order. Each step names where the answer already is.

### 0. Orient

- Open the design system's [overview](../architecture/design-system/overview.md): the
  **Catalogue** table, then each primitive you will use in
  [Primitives](../architecture/design-system/primitives.md).
- Open the playground at `/dev/design-system` (`npm run dev`, any signed-in
  user) and look at those primitives in every state. `?section=<id>` isolates
  one.
- Find the reference instance of the grammar you are about to build (step 3)
  and read it before writing anything.

### 1. Catalogue first

Check the Catalogue for a primitive that does the job. If one exists, use it.
If it almost fits, extend it with a prop or variant (in the library, for
everyone). **If none exists, add it to `src/lib/design-system/` first, then
use it**: one file per primitive, the API conventions below, a barrel export
in `index.ts`, a section in `playground/sections/` registered in
`playground/sections.ts`, and a row in the Catalogue plus a section of
rationale in [Primitives](../architecture/design-system/primitives.md). Never build a primitive inside a route or feature.

### 2. Tokens only

- Colours, spacing, radius, shadow, weight and text size come from `--ds-*`
  (`docs/architecture/design-system/tokens.md#tokens`). No `#hex`, `rgb()`, `hsl()` in a
  component style. No `px` on padding, margin, gap, radius, font-size or
  line-height, except `1px`/`2px` hairlines.
- A bordered control's height is `--ds-control-h-sm/md/lg` (a toolbar item's
  `--ds-toolbar-h-sm/md`), never a literal — controls of one size line up in
  a row, and the design-system a11y spec measures it. Text is on the ladder:
  `--ds-text-xs` only for secondary text beside a control (hint, unit,
  badge). Disabled dims by `--ds-opacity-disabled`; stacking uses
  `--ds-z-*`.
- Chrome reads `--ds-color-*`; page content (block stylesheets,
  `RenderedContent`, the capability style builders) reads `--content-*` and
  never `--ds-*`.
- **A page-content font size is a type-scale step**, `--type-xs` …
  `--type-6xl` (stored `scale:<step>`), never the chrome's `--ds-text-*`; a
  `px` size is a deliberate literal, the escape hatch, not the default. A
  step previewed outside the canvas (a picker in a popover) is drawn at a
  static length, never `var(--type-*)` — its `cqi` would resolve against the
  viewport there (`docs/architecture/typography.md`).
- **Auto is the default; a value is a deviation.** A block's capability
  field (padding, radius, shadow, border, background, rhythm, typography)
  resolves to its group's theme default or its paragraph style's look when
  it sets nothing; the defaults live in Settings → Branding → Block defaults,
  never in a block's own data or an emitter's fallback. An emitter returns an
  override set (`capabilities/overrides.ts`) with only the values that
  deviate — never a style string, never a materialized default, never an
  identical desktop/tablet/phone triple — and a NodeView applies it with
  `applyOverrides`. A new block kind declares its group in
  `blocks/catalog.ts`; a host that must diverge from its group pins the
  `--default-*` var in its own stylesheet (`docs/architecture/blocks/capabilities.md#capability-defaults`).
  The page's own settings (rhythm, reading/wide width, gutters, background)
  follow the same rule on the doc root's attrs and reach the canvas only
  through `pageCanvasOverrides`; the canvas widths and gutters are the
  `--content-width-*` / `--content-gutter-*` tokens, never a px literal. An
  inset that changes per breakpoint goes on `.canvas-blocks`, not on
  `.page-canvas`: the canvas is the query container and cannot query itself
  (`docs/architecture/blocks/layout.md#page-settings`). A columns page's sections take their
  columns from the page template published on the canvas — never give a
  section columns of its own (`docs/architecture/blocks/layout.md#page-layout-sections`). A
  grid's columns on a tablet or a phone are its `columnsByTier`
  (`content/blocks/grid/gridColumns.ts`), and a flex row's arrangement on a viewport
  (one row, stacked, wrapped, scrolling sideways) its Layout capability's
  direction and wrap, both set per viewport in the Layout section — never a
  breakpoint or overflow rule of a block's own (`docs/architecture/responsive.md`). A page
  layout (a preset) is structure only and is copied into the page when chosen
  — never give one a look, and never make a page read its layout live. Which
  cell or section holds a block is structure, moved by command
  (`pageSections.ts`); how a boxed block sits in its column is the
  Placement capability and a flex cell's size is Flex cell — never a width
  or margin rule of a block's own (`docs/architecture/blocks/layout.md#placement`).
- **Admin-authored custom styles are page content too**: a named style is
  written in `--content-*` tokens, so it follows the scheme the page renders
  in; free CSS is the escape hatch for what a named style can't express. Both
  are confined to the content root by the compiler and can never reach the
  chrome (`docs/architecture/custom-styles.md`).
- A colour-dependent token (colour, shadow, a content-colour filter) is added
  to `theme/tokens.ts` — to every scheme's set, derived tokens included —
  never to `app.css` (`docs/architecture/theming.md`).
- **A floating or modal surface reads its elevation token**: a modal
  (Dialog-like) `--ds-color-raised-modal`, a floating layer (popover, menu,
  list, card over a canvas) `--ds-color-raised-floating`, both with
  `--ds-color-border-elevated` — never `--ds-color-bg`. Check new UI in both
  schemes: `/dev/design-system?scheme=dark`, and the lane runs dark too.
- **`data-color-pref` ≠ `data-scheme`.** `data-color-pref` is the viewer's
  preference (`system`/`light`/`dark`), on `<html>` only, set by the server
  (and `applyColorPref` in the browser). `data-scheme` pins a subtree (the
  page canvas and reading area, an island, an HTML block, the playground on
  `<body>`) and never goes on `<html>`. Ask "what does the viewer want" of
  the first, "what does this subtree render in" of the second
  (`docs/architecture/theming.md`).
- **Never restate the focus ring.** The one `:focus-visible` rule in
  `app.css` rings every element; a primitive carries no focus CSS. The four
  sanctioned exceptions (`all: unset` bases, composite frames, a dialog body
  or contenteditable with nothing to ring, a colour swatch's two-tone ring)
  restate it only from the `--ds-focus-ring*` tokens
  (`docs/architecture/design-system/tokens.md#focus-and-selection-rings`).
- **Rings render inside the box, and contrast with it.** `outline-offset` is
  negative, an overlay indicator covers its measured box exactly, and an
  overflowing ring is pulled in, never masked with `overflow: hidden`. A
  filled surface (accent or danger fill) sets
  `--ds-focus-ring-color: var(--ds-color-on-accent)` and
  `--ds-focus-ring-offset: var(--ds-focus-ring-offset-filled)` on itself —
  token values, not a ring rule.
- **Hover only on an enabled control**: scope every `:hover` away from the
  disabled state. Pressed (`:active`) is one step deeper than hover, from
  the interaction tokens (`--ds-color-accent-hover/-pressed`,
  `--ds-color-fill-hover/-pressed`, …), never a literal or a scale. A list
  highlight is `--ds-color-fill-hover`; the accent tint means selected. A
  pointer target is at least 24px, and 44px on touch — through the size
  tokens (`--ds-control-h-*`, `--ds-toolbar-h-*`) or, for a target that
  isn't a sized control, `--ds-target-min`; a field's text is
  `--ds-text-field-sm/md`, 16px on touch. Never a media query on width for
  it, and never hover as the only way to something: a finger has none
  (`docs/architecture/responsive.md#touch`). No reduced-motion rules in primitives —
  `app.css` has the one (Spinner is the documented exception).
- **Busy is `Button loading`**, not a swapped "Saving…" label or a separate
  "Uploading…" line; a `Spinner` stands alone only when nothing else shows
  the progress.
- **No `style` attribute in a template.** The reader's routes ship a strict
  `style-src` (`docs/architecture/overview.md#content-security-policy`): an attribute
  the server renders is blocked, and so is a `style:` directive whose value
  exists during SSR (Svelte renders it as one). A static value is a class; a
  value known only in the browser (a drag width, a card position) is a
  `style:` directive that is `undefined` on the server; a value from data (a
  logo height from settings, a block's overrides) is a rule of the per-page
  stylesheet — register it with the load's `StyleCollector` and put the id
  on the element as `data-b`. In scripts, `el.style.setProperty`, never
  `setAttribute('style', …)` or a `<style>` element without the document's
  nonce (`styleNonceFor`). A link from a strict route into a loose one (the
  editor, the settings) is a full navigation (`data-sveltekit-reload`).
  `check-ui`'s `inline-style` rule flags a new attribute.
- `npm run check:ui` enforces the first two mechanically and the design-system a11y spec
  (step 6) the ring rules. A genuinely un-tokenizable literal gets a
  `ui-check-allow: <rule> — <reason>` marker (see
  `docs/architecture/design-system/overview.md#guardrails`).

### 3. Pick the grammar

Every surface in the app is one of these. Match the reference; do not invent
a layout.

| Surface | Compose from | Reference | Docs |
|---|---|---|---|
| Settings page (rows of label + description beside a control) | `SettingsPageHead` + `SettingsGroup` / `SettingsRow` / `SettingsWell` | `src/routes/settings/branding/+page.svelte` | `docs/architecture/settings.md#the-settings-row-content-pattern` |
| List page (manage a catalogue) | `SettingsPageHead` + `Table` / `TableRow` / `TableCell` (an `EmptyState` when there are no rows); add/edit in a `Dialog` around a `<form method="POST" use:enhance>`, mounted fresh per open with `untrack()` snapshots; delete via a `variant="danger"` Dialog | `src/routes/settings/schema/properties/+page.svelte` + `src/lib/features/semantic/routes/PropertyDefinitionModal.svelte` | `docs/architecture/design-system/patterns.md#settings-pages` |
| Block settings (a narrow panel of settings) | `BlockSettingsSection` (editor) → `CollapsibleGroup` + `FieldRow` (`inline` for controls up to ~120px, else `stack`) with `NumberField`, `Select size="sm"`, `SegmentedControl size="sm" stretch`, `Switch`, `ColorPickerField`, `IconPickerField`, `PositionGrid`, `InfoTip` | `src/lib/features/editor/blockSettings/SpacingSection.svelte` | `docs/architecture/blocks/capabilities.md#where-capabilities-are-edited` |
| Menu of commands | `DropdownMenu` (+ `DropdownMenuItem`, `DropdownMenuSeparator`); on a phone the same items in a `BottomSheet` | `src/lib/shell/appbar/AccountMenu.svelte` | `docs/architecture/design-system/primitives.md#what-is-not-a-primitive` |
| Small anchored panel with controls | `Popover` (trigger face: `TriggerFace`, name via `triggerProps`) | `src/lib/design-system/ColorPickerField.svelte`; a button-look trigger: `src/lib/features/editor/meta/TagsPopover.svelte` | `docs/architecture/design-system/patterns.md#composing-toolbar-with-overlay-triggers` |
| Modal task | `Dialog` (sizes `sm`–`xl`, `variant="danger"` for a confirm); bounded to the viewport, body scrolls, footer stays — never add height/overflow rules on its content (a fixed head over a scrolling list is `body="fill"`); fields are `FormField` (label, hint, error; the control wires itself; optional fields pass `optionalLabel`), an action error is `<Alert tone="danger">` in the body above the footer | any `*Modal.svelte` under a feature's `components/` | `docs/architecture/design-system/primitives.md#primitive-api-convention` |
| Editor command row | `Toolbar` / `ToolbarButton` / `ToolbarGroup` | `src/lib/features/editor/desktop/toolbar/EditorToolbar.svelte` | `docs/architecture/design-system/patterns.md#composing-toolbar-with-overlay-triggers` |
| Picking a page, document or collection | the search feature's `NodePicker` (`$lib/features/search/picker`: a large `Dialog`, a sheet on the phone shell; types, a caller's `mark`, `rowAction`, `create`) — never a `Command` of the feature's own | `src/lib/features/editor/collection/MembersEditor.svelte` | `docs/architecture/search.md#the-node-picker` |

Also fixed:

- **Heading hierarchy**: `h1` is the page head, `h2` a `SettingsGroup`,
  `h3` a `CollapsibleGroup`. Don't skip levels, don't style a `div` as a
  heading.
- **Tabs are an in-page panel swap only.** Route-level sections live in the
  settings sidebar tree (`src/lib/shell/settings/tree.ts`).
- **Phone** overlays are `BottomSheet` (a styled `Dialog`), never a forced
  full-width `DropdownMenu`; a menu inside one is `BottomSheetItem` rows.
- **A picker in a plain `<form method="POST">`** is still `Select` — pass
  `name` and it posts through a hidden input; an "inherit / none" choice is a
  sentinel mapped back to `''` in a hidden field (Select has no empty item).
- **An error sits next to what caused it**
  (`docs/architecture/design-system/patterns.md#where-an-error-goes`): a wrong value is a field
  error — `FormField` / `FieldRow` `error`, or a `FieldError` the control
  names via `aria-describedby` + `aria-invalid` — a failed action is an
  `Alert`, and only an outcome with nothing on screen to attach to (a failed
  save after the user moved on, a paste upload, a clipboard copy) is a
  `toast.error(…)`. No page-local `.error` paragraphs, no second toast stack.
  A value that is allowed but has a consequence (a colour that won't read on
  its background) is a `FieldRow` `warning` / `FieldWarning`, not an error.
- **A settings page is rows, not cards.** `SettingsWell` is the one inset
  surface, for an asset preview.
- **Responsive** means the container, not the viewport, where a pane can be
  narrow (`SettingsRow` stacks when the row itself is narrow); tables scroll inside
  their own wrapper with a `minWidth`, never reflow into cards.
- **The phone shell is one query.** A chrome rule that changes with the
  shell — the bar at the bottom, an action folded into the menu sheet, the
  phone editor — uses `PHONE_SHELL_MEDIA`'s query
  (`lib/design-system/shell.ts`: a phone-width window or a phone held
  sideways), in CSS and in `matchMedia` alike, never the bare `max-width:
  640px`; check-ui's `shell-media` holds every `@media` to it
  (`docs/architecture/responsive.md#two-kinds-of-breakpoint`).
- **Nothing scrolls sideways** at 360, 390 or 768 px (`docs/architecture/responsive.md`):
  not the page, not an element, not a word. Something that can be wider than
  its column scrolls in a box of its own (a table's wrapper, a code block); a
  row of actions wraps (`flex-wrap: wrap` — a `justify-content: flex-end` row
  that can't wrap overflows to the left, where nothing scrolls); a text
  column's width is bounded by its container (`max-width: min(…, 100%)`, a
  flex child's `min-width: 0`), never by its longest word, and long words
  break (`overflow-wrap: break-word`). Page content gets this from
  `canvasContent.css` and the block stylesheets — don't restate it per
  block.
- **A box that scrolls sideways shows it**: a chrome scroller carries the
  `scroll-cue` class, which fades the edge where more waits (page content's
  scrollers are named in `app.css`); a layer fixed to the bottom of a phone's
  screen, or centred in it, subtracts `--ds-keyboard-inset` so the on-screen
  keyboard never covers its footer or its field
  (`docs/architecture/responsive.md#scroll-cues`, `#the-on-screen-keyboard`).

### 4. Interaction conventions

- **Keyboard first.** Every action reachable by Tab/Enter/Space/arrows through
  the primitive's own semantics; Escape and outside-click close every layer.
- **Next to the live editor** (`docs/architecture/design-system/patterns.md#composing-panels-next-to-a-live-text-editor`):
  a panel's open state feeds `EditorOverlays.any` (report it upward through
  `BlockSettings.svelte`'s `onOverlayOpenChange` refcount) so the editor's window
  Escape handler stays quiet; an apply-and-close action passes
  `editor/desktop/keyboard.ts`'s `preserveEditorFocusOnClose` as `onCloseAutoFocus` so Bits
  UI does not steal the caret back; a panel that blurs the editor captures
  its range first (as `core.links.begin()` does) and restores it on apply.
- **Overlay primitives** take `bind:open` or the controlled pair
  (`open` + `onOpenChange`); a trigger is disabled through the primitive's
  `disabled` prop, not by disabling the snippet's inner element.
- **Don't borrow a primitive's internal class** (`.ds-menu-item`) and don't
  `:global()` into one. A consumer that can't render the primitive gets its
  own locally named classes. A variation the consumer needs (a dialog's
  width, a compact picker) is a primitive prop (`Dialog size`, `Select size` /
  `width`), not a `class` plus an override rule — a scoped primitive rule wins.
- **Icon-only controls** carry `title` and `aria-label` with the same string.

### 5. Writing

- Every user-visible string in `features/`, `shell/` and `routes/` goes
  through Paraglide: `import * as m from '$lib/paraglide/messages'`, a
  `snake_case` key with the feature prefix, added to **both**
  `messages/de.json` and `messages/en.json`. English is the catalogues' base
  locale; which languages are offered and which is the default is a site
  setting (Languages) — read it through `enabledLocales()` /
  `siteDefaultLocale()` (`platform/i18n/siteLocales.ts`), never a literal
  `'de'`/`'en'` or Paraglide's `locales`.
- **Interface language ≠ content language** (`docs/architecture/languages.md`). Chrome speaks
  the interface language (`getLocale()`); anything that IS content — a
  page's canvas, a document's title and values, query-block output — carries
  the node's `locale` (`lang={locale}` on the content element; server
  renders run in `withContentLocale`). Never use one for the other.
- The design-system layer imports no i18n: labels, hints, aria names are
  string props the consumer passes.
- **Schema labels are localized text, not messages** (`docs/architecture/languages.md`): a
  property definition's, group's, class's or relationship type's label,
  description and inverse label are a `LocalizedText` (one string per
  locale). Read one only through `localize()` — the server resolves before
  data reaches a component, so a picker or a field label gets a plain
  string; never index a locale (`label.de`). Edit one with the semantic feature's
  `LocalizedField` (the compact one-line `LocalizedTextField` bound to the
  enabled languages; a label requires the site default, a description is
  `multiline`). **Identity never localizes**: what a
  control stores, posts or matches is the name/slug/id, never the label, and
  anything derived from an entity (a colour slot, an order that must not
  move) keys off the identifier. A future enum's option labels are
  `LocalizedText` from day one.
- **Sentence case** everywhere (titles, buttons, tabs, badges, table
  headers). No `text-transform: uppercase`, no Title Case, no ALL CAPS.

### 6. Verify

1. `npm run check` — svelte-check with warnings as errors (a11y warnings
   included), the boundary check, and `check-ui`.
2. Look at it: the playground for a primitive, the page itself for a surface
   — with the Playwright recipe below, driving hover and focus for real.
3. The design-system a11y spec if a primitive changed:
   `npx playwright test src/lib/design-system/e2e` (it builds first and serves
   the build on the test database; `E2E_SERVER=built` reuses the last build —
   `docs/guides/testing.md`).
4. The feature's own e2e spec, if it has one.
5. Then the definition of done.

## Definition of done

- [ ] Keyboard-operable end to end; Escape/outside-click close every layer.
- [ ] Visible focus on every focusable, painted inside the box, 3:1 against
      the fill it sits on (Tab through; the design-system a11y spec measures it).
- [ ] Contrast: 4.5:1 text, 3:1 non-text indicators (accent on tinted
      surfaces gets the white hairline companion).
- [ ] Tokens only — `check-ui` passes with no new baseline entries and no
      reasonless `ui-check-allow`.
- [ ] No `style` attribute the server would render (class, SSR-`undefined`
      `style:` directive, or a `data-b` rule); a change on a reader route
      raises no violation in the e2e suite (every test fails on one) and keeps
      the CSP spec (`src/lib/shell/e2e/csp-style-src.spec.ts`) green.
- [ ] Primitives only — no page-local primitive, no raw `<select>`,
      `<textarea>`, `<button>`, text `<input>`, checkbox or radio outside the
      library; overlay triggers wear `TriggerFace`.
- [ ] Responsive: the narrow container/phone width has no horizontal
      overflow; tables scroll inside their wrapper. A new surface or a block
      that can be wide is added to the responsive guardrail
      (`src/lib/shell/e2e/responsive.spec.ts`), or its own spec asserts
      `horizontalOverflow(page)` (`tests/e2e/responsive.ts`) is empty at a
      phone width.
- [ ] Touch: with a finger (`hasTouch`) nothing is under 44 × 44 px and no
      field's text under 16px (`touchTargets`, `tests/e2e/responsive.ts`;
      `src/lib/shell/e2e/touch.spec.ts`), and help text opens on a tap.
- [ ] i18n'd: `de` and `en` keys added, nothing hardcoded.
- [ ] Sentence case, no uppercase transforms.
- [ ] No new one-offs: the grammar matches its reference instance.
- [ ] A changed or new primitive has its playground section, catalogue row and
      docs paragraph updated.
- [ ] `npm run check` green; design-system a11y spec green if a primitive changed.

## Anti-patterns

- A `Button.svelte`, `Select.svelte`, card or popover defined inside a route
  or feature.
- A hand-positioned `position: absolute` panel where `Popover`,
  `DropdownMenu`, `Tooltip` or `Dialog` fits.
- Raw `<select>`, `<textarea>`, `<button>`, a text-shaped `<input>`, a
  checkbox (→ `Checkbox`) or a radio (→ `RadioGroup`) outside
  `src/lib/design-system/` (inputs without a primitive — file, color — are
  fine).
- A hand-styled span (`.tb-btn`, `.trig`) as an overlay trigger's look — the
  snippet renders `TriggerFace`, and the name goes in `triggerProps`.
- A hand-rolled chip, a link-styled `<button>` (→ `Button variant="link"`), a
  results list of raw buttons in a picker (→ `Command` + `CommandSearch` +
  `CommandList` + `CommandItem`; a picker of pages, documents or collections
  is the search feature's `NodePicker`), or a field whose text
  bypasses `--ds-text-field-*` (on touch every field is 16px).
- A page-content rule (code, lists, links) copied into an editor shell — it
  belongs in `features/content/blocks/canvasContent.css`, shared with the
  public renderer.
- `outline-offset: 0` or positive; a second focus-ring rule; `overflow: hidden`
  to hide a ring; a background tint instead of a ring.
- Everything in cards; a grid of tiles where rows were the pattern.
- `:global()` reaching into a primitive; reusing `.ds-*` internal classes.
- A hex colour in a
  component.
- A `style="…"` attribute, or `el.setAttribute('style', …)`, on anything a
  reader route renders; a `<style>` element created without the document's
  nonce.
- Hardcoded German or English strings; `text-transform: uppercase`.
- Tabs as route navigation; a `DropdownMenu` forced full-width on a phone;
  height/overflow rules on a `Dialog`'s content.
- Storybook, or any second catalogue: the playground is the rendered docs.

## Primitive API conventions

Full text in `docs/architecture/design-system/primitives.md#primitive-api-convention`. In short:

- Callbacks `on<Event>`; a value change is always `onValueChange`, never
  `onChange`. State via `$bindable()` (`bind:open`, `bind:value`) plus the
  controlled pair (Combobox is the documented controlled-only exception).
- `variant` and `size` are string unions (`'sm' | 'md' | 'lg'`), never
  boolean-per-variant props (`variant="danger"`, not `danger`); `size`
  defaults to `md`. Booleans are states, unprefixed (`disabled`, `loading`,
  `active`, `checked`). A glyph's pixel size is the one numeric `size`.
- `class` is the only style escape hatch, spread onto the root.
- Accessible names: a styled native element (`Button`, `Input`) takes
  `aria-label`; a composite or Bits UI-backed control takes `ariaLabel`; an
  overlay trigger takes it via `triggerProps`. Layout primitives take plain
  string `label` / `hint` / `description` props; no primitive defaults a
  user-visible string (the consumer passes the translated text).
- A Bits UI wrapper renders its own literal element through the `child`
  snippet (`docs/architecture/design-system/primitives.md#styling-bits-ui-wrapper-primitives`); a
  primitive with no Bits UI behind it is a styled native element.

## Verification recipe (Playwright)

The design-system a11y spec is `src/lib/design-system/e2e/playground.spec.ts`. For an
ad-hoc look at a primitive or a page:

1. Seed the test database once (no server is started; in PowerShell, set
   `$env:DATABASE_URL` on a line of its own instead):
   ```bash
   DATABASE_URL=postgres://user:password@localhost:5432/owlgraph_test \
     npx tsx --tsconfig tsconfig.tsx.json --import ./scripts/lib/register-svelte.mjs \
     -e "const m = await import('./tests/e2e/global-setup.ts'); await m.default();"
   ```
   It writes `tests/e2e/.auth/<role>.json` (session cookies, valid on any port)
   and `tests/e2e/.seed.json`.
2. Start a server on a spare port against that database, in the background:
   `npx vite dev --port 5199 --strictPort`.
3. Drive it from a script. One outside the repository can't resolve bare
   package names, so it imports Playwright through a `file://` URL to
   `node_modules/@playwright/test/index.mjs`:
   ```js
   const { chromium } = await import('file:///…/node_modules/@playwright/test/index.mjs');
   const { default: AxeBuilder } = await import('file:///…/node_modules/@axe-core/playwright/dist/index.mjs');
   const browser = await chromium.launch();
   const ctx = await browser.newContext({ storageState: '…/tests/e2e/.auth/admin.json', locale: 'en-US' });
   const page = await ctx.newPage();
   await page.goto('http://localhost:5199/dev/design-system?section=button');
   const cell = page.locator('[data-playground="button"] [data-specimen="variant-primary"]');
   await cell.locator('button').first().hover();            // live hover
   await cell.screenshot({ path: 'button-primary-hover.png' });
   // Live focus ring: Chromium paints :focus-visible only for keyboard-driven
   // focus, so Tab to the control instead of calling focus() after a hover.
   await page.keyboard.press('Tab');
   await cell.screenshot({ path: 'button-primary-focus.png' });
   const { violations } = await new AxeBuilder({ page }).include('[data-playground="button"]').analyze();
   console.log(violations);
   await browser.close();
   ```
   The same shape works for any app page: navigate, interact, screenshot,
   `AxeBuilder`. `locale: 'en-US'` matters — without it the browser's own
   language decides the interface's, and English role names may not match.
4. Kill the server by the PID owning the port when done. Never edit `src/`
   while the script or an e2e run is active (HMR remounts mid-run), and never
   run `npm run check` while a server is up (the sync makes it stale).

## Not adopted

**Storybook.** Stories-as-examples, an isolated render/screenshot harness and
an a11y addon are what the playground, Playwright and axe already provide,
with no second toolchain and no second catalogue to drift from the docs. The
revisit criteria are in `docs/architecture/design-system/overview.md#playground`.
