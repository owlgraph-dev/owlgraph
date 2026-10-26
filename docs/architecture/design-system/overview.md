# Design system

App **chrome** — buttons, dialogs, menus, form controls: the UI around
content, not the content itself — is built on [Bits UI](https://bits-ui.com/),
a headless Svelte primitive library, styled with a small design-token
vocabulary. It is a separate concern from the [block and capability
model](../blocks/overview.md), which styles authored **page content**. The two
are related on purpose — content's `--content-*` palette defaults to the
chrome's colours, and both use the same spacing, radius, shadow and weight
scale — but not merged ([Tokens and rings](tokens.md)).

This page is the overview: where things live, the catalogue of primitives,
how the interface is written, the playground and the guardrails. The rest has
a page each:

- [Tokens and rings](tokens.md) — the `--ds-*` tokens, focus and selection
  rings, and the cascade layers page content is styled in.
- [Primitives](primitives.md) — the conventions every primitive's API
  follows, how a Bits UI wrapper is styled, and each primitive in turn.
- [Patterns](patterns.md) — a toolbar with overlay triggers, where an error
  goes, the settings pages, and panels next to a live text editor.

The procedure for building UI is
[Building UI](../../guides/building-ui.md).

## Where things live

- `src/lib/design-system/` — the primitive components, one file per
  primitive, barrel-exported from `index.ts`; the [catalogue](#catalogue) below
  lists them.
- `src/lib/design-system/theme/` — the colour-scheme tokens (every
  colour-dependent `--ds-*` token, one complete set per scheme), the emitter
  that turns them into CSS and the shared colour math; see
  [theming.md](../theming.md).
- `src/app.css` — the `--ds-*` tokens that don't change with the colour
  scheme (space, radius, heights, text, weight, z-index, ring width), in a
  dedicated section.
- `src/lib/design-system/playground/` — the [playground](#playground), every
  primitive rendered in every state, served at `/dev/design-system`.
- `src/lib/design-system/e2e/playground.spec.ts` and `scripts/check-ui.mjs`
  — the [guardrails](#guardrails).
- `docs/guides/building-ui.md` — the procedure for building UI: what
  to do, in what order, before touching a component. This page is the
  reference it routes to.

## Catalogue

What exists, what each is for, and what it is *not* for — the first thing
to check before building UI. The last column is the section id on the
[playground](#playground) (`/dev/design-system?section=<id>`), where every
row is rendered in every state; [the primitives](primitives.md#the-primitives) section by
section carries the rationale.

| Primitive | Use it for | Not for | Variants / sizes | Playground |
|---|---|---|---|---|
| `Button` | any clickable action; `href` renders a link styled as a button | toolbar toggles (`ToolbarButton`), exclusive option groups (`SegmentedControl`) | `variant` primary / secondary / ghost / danger / ghost-danger / link · `size` sm / md / lg · `icon`, `active`, `loading` (spinner over the label, width kept) | `button` |
| `Spinner` | indeterminate progress, in the current text colour | progress inside a Button (its `loading`); a known percentage | `size` (px) · `label` makes it a status | `spinner` |
| `Input`, `Textarea` | free text, full width of its row or cell | a number beside a label (`NumberField`), a value from a list (`Select`, `Combobox`) | Input `size` sm / md / lg (a touch sheet, 16px+ text) · `aria-invalid` is the error state | `input` |
| `SearchField` | a page's search form: the term, its submit an icon inside the field | filtering a list in place (`Input`); a command menu (`Command`) | `name` (the input posts itself) · `ariaLabel`, `submitLabel` · md | `search-field` |
| `CodeArea` | source someone writes by hand — a stylesheet, a snippet | prose (`Textarea`); rendered read-only code (a code block) | `highlight` callback · `rows` · `invalid` · `ariaDescribedby` | `code-area` |
| `NumberField` | a short number with its unit, in a narrow panel | a full-width numeric field (`Input type="number"`) | `size` sm / md (default md) · `width` auto / full · `unit` | `number-field` |
| `Select`, `MultiSelect` | one (or several) of a closed list | free text (`Combobox`); two to four always-visible options (`SegmentedControl`) | flat `items` or `groups` (an item may be `disabled`) · `size` sm / md · `width` auto / full · `name` posts it in a plain form · `leading` draws a picture before each label (Select) — decoration beside the name, as a page layout's thumbnail is · `trailing` draws a short state after an option's label in the list (Select; a language's "missing") | `select` |
| `Combobox` | text with suggestions where free text is a valid value | a closed list (`Select`) | `type` text / number · `size` sm / md · `commitOnBlur` · controlled-only | `combobox` |
| `ChipInput` | several free-text values | a static label (`Badge`) | `suggestions`, `max`, `removeLabel` · `size` sm / md | `chip-input` |
| `Chip` | one chosen value as a pill, optionally removable (ChipInput's chip; a tag list outside a ChipInput) | a static label (`Badge`) | `label`, `removeLabel` + `onRemove` · `size` sm / md | `chip-input` |
| `Switch` | an on/off setting that applies immediately | a choice that is saved with a form | `ariaLabel` · `size` sm / md | `switch` |
| `Slider` | a continuous number in a bounded range | a small closed set (`SegmentedControl`, `Select`) | `min` / `max` / `step`, `onValueCommit` | `slider` |
| `Checkbox` | one on/off choice submitted or saved with others (a member of a list, a block to keep) | a setting that applies at once (`Switch`) | `size` sm / md · `indeterminate`, `name` + `value` · label as children | `checkbox` |
| `RadioGroup` | one value from a short labelled list in a form, where other fields depend on it | two to four inline options applied at once (`SegmentedControl`); a longer list (`Select`) | `items` · `orientation` · `size` sm / md · `name` · named by a `FormField group` | `radio-group` |
| `SegmentedControl` (+ Item) | two to four exclusive options kept visible; a set of toggles | five or more options (`Select`) | `type` single / multiple · `size` sm / md · `stretch` | `segmented-control` |
| `PositionGrid` | where a cropped picture anchors: nine points in a 3×3 grid (an image's focal point, a background image's focus) | a one-axis alignment (`SegmentedControl`) | `labels` (each cell's name) · `disabled` | `position-grid` |
| `ColorField`, `ColorPickerField` | the swatch group; its compact trigger for a field row | — | `resolved`, `mixed` · `themeColors` + `themeLabel` / `customLabel` (a labelled group of colours that follow the scheme above the custom palette, [theming.md](../theming.md#colour-references)) · `custom` (false: theme colours only) | `color` |
| `ScaleField` | a value from a named scale, with a custom number as the escape hatch (a font size: the type scale, then px) | a closed list with no custom value (`Select`); a free number alone (`NumberField`, `Combobox`) | `steps` (each drawn at its `preview` size) + `stepsLabel` / `customLabel` · `customOptions`, `min` / `max` · `mixed` | `scale` |
| `IconPickerField` | the compact form of an icon setting | — | — | `icon-picker` |
| `FormField` | one field of a form the user fills in and submits (a dialog's add/edit form) | a setting in a settings pane (`SettingsRow`) or a narrow panel (`FieldRow`); a form-level action error (`Alert`) | `hint`, `warning`, `error`, `optionalLabel`, `group`, `for` · the control wires itself | `form-field` |
| `LocalizedTextField` | one text in several languages on one line — a name stored per language (a schema label) | one text (`Input` in a `FormField`); a page's content in another language (a separate node, not a field) | `locales` (code, label, `required`) in display order · `name` (each language posts `name.code`) · `multiline` · `copyFrom` / `copyLabel` · `preservedNote` · the words as props (`languageLabel`, `missingLabel`, `requiredLabel`, `progressLabel`) | `localized-text-field` |
| `FieldRow`, `InfoTip` | one setting in a narrow panel (the block settings panel) | a wide settings pane (`SettingsRow`) | `layout` inline / stack · `hint`, `info`, `error`, `warning`, `trailing` · the control wires itself | `field-row` |
| `FieldError` | the error line of a control outside `FormField` / `FieldRow` | a control inside either (their `error` prop); an action that failed (`Alert`) | `id` (the control's `aria-describedby`), `message` | `form-field` |
| `FieldWarning` | the warning line of a control outside `FieldRow` / `FormField`: an allowed value with a consequence worth knowing (a colour that is hard to read on its background) | a wrong value (`FieldError`); a control inside `FieldRow` (its `warning` prop) | `id` (the control's `aria-describedby`), `message` | `field-row` |
| `CollapsibleGroup` | a flush, independently collapsible group in a column of them | a framed group (`Accordion`) | `modified` | `collapsible-group` |
| `SettingsGroup`, `SettingsRow`, `SettingsWell` | a settings page: titled groups of label-and-description rows, one inset well | a list (`Table`), a narrow panel (`FieldRow`) | SettingsRow `layout` split / wide | `settings` |
| `Table` (+ Row, Cell) | every settings list | tables inside page content (the table block) | declared `columns`; cell `mono` / `muted` / `truncate` / `nowrap` / `align` / `indent` / `actions`; row `tone` | `table` |
| `Pagination` | a long result list, a page at a time; every page a link | a list that fits one screen; loading more in place | `page`, `pageCount`, `href(page)` · the labels as props (`ariaLabel`, `previousLabel`, `nextLabel`, `pageLabel`) · a short row in a narrow container | `pagination` |
| `Alert` | a message about what the user is doing: failed, caveat, note, done | an error about one field (the field's own error text); a static label (`Badge`) | `tone` danger / warning / info / success · `layout` inline / banner · `title`, `actions` | `alert` |
| `toast`, `Toaster` | the outcome of an action with nothing on screen to attach to | a wrong value (`FieldError`); a failed submit or a lasting state (`Alert`) | `toast.error` / `warning` / `info` / `success` · `action`, `duration` · Toaster mounted once in the root layout, its `class` a hook for the consumer's phone clearance (`--ds-toaster-phone-bottom`) | `toast` |
| `EmptyState` | what a list, table, panel or search shows when it has nothing | a hint or instructions beside a field (a FormField `hint`); a failed action (`Alert`) | `size` sm / md · `layout` inline / centered · `live` · `actions` | `empty-state` |
| `Badge` | a small static label next to a name | a removable value (a chip) | `tone` neutral / accent / info / success / warning / danger (a change's kind, a status) | `badge` |
| `Card` | one item among many, side by side or stacked — a search result, a browsed page | settings (rows), a list of rows (`Table`), an inset preview (`SettingsWell`) | `as` article / li / div · `size` sm / md (md takes the dense padding on a phone) | `card` |
| `Avatar` | a user image with an initials fallback | — | `size` sm / md / lg | `avatar` |
| `Icon` | chrome glyphs (stroke = currentColor, `aria-hidden`) | content icons (`icons.ts`: the authorable quick-link icons, and the block glyphs a block draws on its own — a file's type, a state — which no picker offers) | `name`, `size` | `icon` |
| `Tabs` (+ Trigger, Content) | an in-page panel swap | route navigation (the settings sidebar) | `activationMode` | `tabs` |
| `SortableList` | an order its user rearranges — a collection's members | a fixed list (a plain list); moving items between lists | `items`, `key`, `onMove(from, to)` · the words as props (`handleLabel`, `instructions`, `announce`) · `item` snippet places the `handle` · `disabled` | `sortable-list` |
| `Accordion`, `AccordionItem` | framed sections that open independently, inside a dialog | a column of flush sections (`CollapsibleGroup`) | item `size` sm / md | `accordion` |
| `ConditionGroup` | the group block of a filter or rule builder | — | `combinator`, `depth`, `label` | `condition-group` |
| `Tooltip` | short help on hover or focus | essential information; anything with controls (`Popover`) | `trigger` snippet, or controlled `customAnchor` · `side` · `disabled` · `toggle` (a click or tap pins it) | `tooltip` |
| `Popover` | a small anchored panel with controls | a list of commands (`DropdownMenu`); a form (`Dialog`) | `side` / `align` · `size` auto / md (a picker's width) · `onCloseAutoFocus`, `onEscapeKeydown` (Escape, not a click outside, is closing it) · `disabled` | `popover` |
| `TriggerFace` | the button look of a Popover / DropdownMenu / Tooltip trigger, inside its snippet | a trigger whose face is a preview (a swatch, an avatar) | `variant` toolbar / ghost / secondary · `size` sm / md · `icon`, `split`, `active` | `trigger-face` |
| `DropdownMenu` (+ Item, Separator, Group, GroupHeading) | commands behind a trigger, in named groups when the menu is long | a phone sheet (`BottomSheet`) | `disabled` · item `variant` default / danger · `active` (the current one) / `checked` (an on/off toggle) / `href` | `dropdown-menu` |
| `Dialog`, `BottomSheet` | a modal task, a confirm, the phone sheet | an anchored panel (`Popover`) | `size` sm / md / lg / xl · `variant` default / danger · `body` scroll / fill (fill: the body never scrolls, its one child keeps a head in place and scrolls its own list) · BottomSheet `size` md / lg, `footer` (actions below the scrolling body), `actions` + `closeLabel` (a header state and a close button), pages (a part of its content shows a page in its place: `getSheetPageOutlet`) | `dialog` |
| `BottomSheetItem` | a row of a menu inside a BottomSheet (link or command), touch-sized | a desktop menu (`DropdownMenuItem`) | `href` · `active` · `variant` default / danger · `trailing` | `dialog` |
| `Command` (+ List, Item, Input) | a filtered list of commands or results, composed inside a `Dialog`, a `Popover` or a sheet — `CommandList` is its listbox | a standalone picker (`Select`, `Combobox`); picking a node (the search feature's `NodePicker`, which composes this) | `shouldFilter` (off for a server's results) · item `disabled` (skipped by the arrows, muted, its row says why) · `CommandInput` is the bare field, for the search overlay's head alone | `command` |
| `CommandSearch` | a command's search field: framed, a clear button, the row's whole width | a form's search term (`SearchField`); filtering a list in place (`Input`) | `size` md / lg · `clearLabel` · Escape clears a typed term before the layer closes | `command-search` |
| `Toolbar` (+ Button, Group, GroupItem) | the editor's command row | a generic row of buttons | button `variant` ghost / primary / ghost-danger · `size` sm / md | `toolbar` |
| `NavigationMenu` | the app bar's desktop navigation | a phone (`BottomSheet`) | `items` | `navigation-menu` |

Beyond the primitives, the app shell contributes `SettingsPageHead`
(`src/lib/shell/SettingsPageHead.svelte`: the page `h1`, one intro line,
the single Add action, the error banner) and the editor its
`BlockSettingsSection` — consumers of this catalogue, described where they
are used in [Settings pages](patterns.md#settings-pages) and
[blocks/capabilities.md](../blocks/capabilities.md#where-capabilities-are-edited).

New UI work uses these primitives and the `--ds-*` tokens rather than
hand-rolling chrome. Existing hand-rolled components migrate onto them on
touch, not all at once; [check-ui's baseline](#guardrails) is the inventory
of what is still to migrate, and it only shrinks.

## Writing

Chrome speaks every configured language: `en` is Paraglide's base locale
(the fallback for a request that asks for no configured language), `de` the
second (`project.inlang/settings.json`), and every user-visible string in a
feature, the shell or a route is a message (`import * as m from
'$lib/paraglide/messages'`, a `snake_case` key with the feature's prefix,
present in both `messages/en.json` and `messages/de.json`). The design-system
layer imports no i18n at all — a primitive's labels, hints and accessible
names are plain string props, so the same `FieldRow` serves the editor in
German and the test suite in English without knowing either. A name an
admin creates at runtime — a property's label, a class's description — is
not a message but localized text, read through `localize()` and edited with
`LocalizedTextField` ([languages.md](../languages.md)).

Everything is **sentence case**: page titles, section titles, buttons, tabs,
badges, table headers, menu items. No Title Case, no all caps, and no
`text-transform: uppercase` standing in for a heading style — a small muted
label is `--ds-text-sm` in `--ds-color-muted`, still sentence case. An
icon-only control's `title` and `aria-label` carry the same message a text
button would show.

## Playground

`/dev/design-system` renders every primitive in every state — each variant
and size; default, disabled, loading, active, invalid, empty, overflowing;
grouped, nested, truncated — with a usage note per section. It is the
catalogue *rendered*: one primitive is one catalogue row, one section of
rationale in [Primitives](primitives.md#the-primitives), and one section in
`src/lib/design-system/playground/sections/`, registered in
`playground/sections.ts` in catalogue order. Nothing else describes
primitives, so there is no second catalogue to drift. A new or changed
primitive updates all three.

Three states are deliberately *not* rendered statically: **hover, pressed and
focus are live.** The single global `:focus-visible` rule is the one ring, and a
"focused" specimen would be a second ring implementation of exactly the kind
the [ring rules](tokens.md#focus-and-selection-rings) forbid. Tab through the page, or
drive `hover()`/`focus()` from Playwright, which is how the guardrails and
the skill's verification recipe see those states. `?section=<id>` isolates
one section for a screenshot or an axe run; each section is
`<section data-playground="<id>">` and each cell `[data-specimen="<state>"]`,
so a script addresses a state without CSS-class knowledge. A cell whose
control opens a floating layer carries `data-overlay`, and the design-system a11y spec
opens every one of them.

It is dev tooling, not a user surface: like GraphiQL it is on under `vite
dev` and a production build serves 404 there unless
`ENABLE_DESIGN_PLAYGROUND=true`; a session is still required. The route file
holds that gate itself (the design system is not a feature and imports
nothing from `$app/*`); `dev` is a reserved slug ([routing.md](../routing.md)).
Its strings are plain English — the layer takes no i18n, and a dev tool is
not the product.

There is no Storybook. What it would add for an agent — stories as examples,
an isolated render-and-screenshot harness, an a11y addon — is exactly what
the playground, Playwright and axe provide, with no second toolchain and no
second catalog.

## Guardrails

Three checks fail when a component drifts, so the rules of these pages are enforced
rather than remembered:

- **Compiler warnings are errors.** `npm run check` runs svelte-check with
  `--fail-on-warnings`; Svelte's a11y warnings (a click handler without a
  key handler, an image without alt, a label without a control) stop the
  check. There are no `svelte-ignore` suppressions — the fix is in the
  markup.
- **The design-system a11y spec** (`src/lib/design-system/e2e/playground.spec.ts`, run
  with the e2e suite or alone via `npx playwright test
  src/lib/design-system/e2e`; the branded lane of `npm run test:e2e` runs its
  axe, focus-ring and state-step checks once more under a seeded extreme brand
  accent, whose generated accents must meet the same bars —
  [theming.md](../theming.md#site-theme), [testing.md](../../guides/testing.md#lanes)) runs axe (`@axe-core/playwright`, WCAG 2.1
  AA) over every playground section at rest and over the page with every
  overlay open; sweeps the page by keyboard and asserts that every focusable
  shows a ring whose `outline-offset` is not positive — the
  [inside-the-box rule](tokens.md#focus-and-selection-rings), pinned mechanically —
  and whose colour (or companion band) contrasts 3:1 with the ground it is
  painted on, which catches an accent ring on an accent fill; measures every
  control specimen against its `--ds-control-h-*` / `--ds-toolbar-h-*` token,
  so a literal height or a frame that adds its border on top fails; presses
  one control of each kind and asserts pressed paints differently from hover;
  measures the small glyph controls against the 24px target minimum; checks
  that a loading Button keeps its width and is not dimmed; drives the toast
  stack (announced, dismissable, paused, capped); wires FormField and FieldRow
  errors; and asserts the page never scrolls horizontally at desktop or phone
  width.
- **`check-ui`** (`scripts/check-ui.mjs`, run by `npm run check` and alone
  as `npm run check:ui`) reads every `.svelte` and `.css` file, plus page
  content's style-building modules (`features/content/**/*.ts`), and reports:
  a colour literal — hex, `rgb()`, `hsl()`, or a named colour on a colour
  property — in a component or content style, or in a content style builder
  (`color`: chrome reads `--ds-color-*`, content `--content-*`); a `px` length on padding, margin, gap, radius, font-size or line-height
  other than `0`, `1px`, `2px` (`px`); and a native `<select>`, `<textarea>`,
  `<button>`, text-shaped `<input>`, checkbox or radio outside
  `src/lib/design-system/` (`raw-element`; inputs with no primitive — file,
  color, range, hidden — are exempt); and a `style` attribute in a `.svelte`
  template, and a CSS custom property passed to a component
  (`inline-style`: the reader's routes ship a strict `style-src`,
  [architecture/overview.md](../overview.md#content-security-policy) — a static
  value is a class, a browser-only value a `style:` directive that is
  `undefined` during SSR, a value from data a per-page rule. `<Combobox
  --combo-width="100%" />` counts too: Svelte wraps such a component in
  `<svelte-css-wrapper style="display: contents">`, which is a style
  attribute by another spelling, so set the property from a class on a
  wrapper element or give the component a prop); and a viewport `@media` on
  the phone width that isn't the phone shell's query, `PHONE_SHELL_MEDIA`,
  or on 768 px that isn't the compact chrome's, `COMPACT_CHROME_MEDIA`
  (`shell-media`, read from `lib/design-system/shell.ts`,
  [responsive.md](../responsive.md#two-kinds-of-breakpoint) — a rule about a
  narrow window alone keeps the bare width with an allow marker that says
  so). `src/app.css` (global rules, the
  syntax-highlighting and print palettes) is exempt from the style rules —
  the colour tokens themselves are TypeScript, outside the check. Page-content
  styling (the block stylesheets, `RenderedContent.svelte`) is outside the
  `px` rule: its spacing keeps its own `px` values, and its font sizes come
  from the content type scale (`--type-*`, [typography.md](../typography.md)),
  not the chrome's text ladder. An author-pickable palette — swatches
  stored as fixed literals when chosen — carries an allow marker.

  A genuinely un-tokenizable case is allowed with a reason on the same or the
  preceding line — `/* ui-check-allow: color — the hairline is a contrast
  companion */`, `<!-- ui-check-allow: raw-element — type=file has no
  primitive -->` — and a reasonless marker is itself a problem.
  `scripts/check-ui.baseline.json` records, per file and rule, the
  violations that predate the check: a count above it fails and lists that
  file's violations for the rule; a count below passes with a notice, and
  `node scripts/check-ui.mjs --write-baseline` lowers the baseline to what
  is left. Counts only go down, and a file not in the baseline must be
  clean. The baseline holds nothing for the colour, token, px and raw-element
  rules: every file is clean there, so any new colour literal, px length or
  raw control fails the check outright, and the only exceptions are the
  reasoned `ui-check-allow` markers. Its `inline-style` entries are what
  remains on the routes whose policy still allows them — the editor's chrome,
  the settings previews, the playground's token swatches, the two colour
  pickers, and the `--combo-*` props the editor's comboboxes pass — and a
  new one anywhere fails. The rule cannot tell a reader route from a loose
  one, so a baselined component is only safe where it stands: moving one
  onto a reader route is not something the check can catch. A primitive
  that composes another through its CSS-variable hooks therefore declares
  them in its own stylesheet, where they inherit, rather than as `--prop`
  component props, which Svelte renders as a style attribute: `ChipInput`
  sets its entry's `--combo-*` values on its own frame, and so travels to
  the reader's search page.

  `app.css` carries no button look: its one `button` rule is
  `font: inherit`, a reset. Border,
  padding, fill and hover always come from the component — so a stray raw
  `<button>` shows the browser's default box instead of silently borrowing a
  styled one.

## Related pages

- [Tokens and rings](tokens.md), [Primitives](primitives.md) and
  [Patterns](patterns.md) — the rest of the design system.
- [blocks/overview.md](../blocks/overview.md) — the block and capability
  model (the analogous token system for page content, not chrome).
- [architecture/overview.md](../overview.md) — how this fits into the app as
  a whole.
- [settings.md](../settings.md) — Settings and the settings-row pattern.
- [Building UI](../../guides/building-ui.md) —
  the procedure that routes to this page.
