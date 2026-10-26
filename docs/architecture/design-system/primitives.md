# Primitives

What every primitive's API looks like, how a primitive that wraps Bits UI is
styled, and each primitive in turn. The catalogue that lists them — what each
is for and not for — is in the [overview](overview.md#catalogue).

## Primitive API convention

- **Callbacks**: camelCase `on<Event>` (`onOpenChange`, `onValueChange`),
  matching Bits UI's own prop names. A control's value change is always
  `onValueChange` — never `onChange` — whether Bits UI backs it or not
  (Switch's `onCheckedChange` is the one Bits UI name kept as is).
- **State**: a control's value, and an overlay's `open`, is `$bindable()`:
  `bind:value` / `bind:open`, or the controlled pair (`value` +
  `onValueChange`, `open` + `onOpenChange`) for callers that must coordinate
  state externally. The pair reports every change; with `bind:` the primitive
  also writes it back. `Combobox` is the one controlled-only control (no
  `bind:value`): a commit is reported but never written into `value`,
  because its host ChipInput keeps `value=""` so the entry clears after each
  added chip.
- **Variants**: `variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger' | 'link'`
  (`link` is a text action under a field or in running text — accent,
  underlined, no box),
  (`ghost-danger` is the quiet destructive action for repeated per-row use
  in admin tables; filled `danger` stays for a one-off confirm step),
  `size: 'sm' | 'md' | 'lg'` — string unions, never boolean-per-variant
  props. The same names carry across families: ToolbarButton's quiet delete
  is `variant="ghost-danger"`, a destructive menu command
  `DropdownMenuItem variant="danger"`. `size` defaults to `md` everywhere;
  a narrow-panel consumer passes `size="sm"`. A glyph's pixel size (`Icon`,
  `InfoTip` `size={14}`) is a number, not a size variant — an icon is drawn
  at a pixel size, not placed in a row.
- **Boolean state**: unprefixed (`disabled`, `loading`, `active`,
  `checked`) — a state, never a look.
- **Accessible names**: a primitive that is a styled native element
  (`Button`, `Input`, `Textarea`) takes the native `aria-label` through its
  rest props, like the element it is; a composite or Bits UI-backed primitive
  takes `ariaLabel`, which it places on the right inner element; an overlay
  trigger rendered from a caller's snippet takes it through `triggerProps`.
- **Hover belongs to an enabled control.** Every hover rule is scoped away
  from the disabled state (`:not(:disabled)`, `:not([data-disabled])`, or the
  primitive's own disabled class), so a disabled control never lights up
  under the pointer. Where scoping raises a hover rule's specificity, the
  state rules it must not override (active, invalid, open) are raised with it.
- **Interaction states go rest → hover → pressed, one step deeper each.**
  The steps are scheme tokens, derived from the resting colour: a
  filled control darkens its fill (`--ds-color-accent-hover` / `-pressed`,
  the same for danger); a quiet one (ghost, a list or menu item) lays the
  neutral `--ds-color-fill-hover` and deepens it to `--ds-color-fill-pressed`;
  a tinted one (an active toolbar item, ghost-danger) deepens its tint
  (`--ds-color-accent-soft-pressed`, `--ds-color-danger-soft-pressed`); a
  switch's off track steps its strong border tone. A colour swatch, whose
  fill is the value, darkens by `brightness()` instead. Pressed is `:active`
  on an enabled control, listed after the hover and active rules it must win
  over, and carries no motion — so it reads the same under reduced motion.
- **One list highlight.** The keyboard or pointer highlight of every list —
  Select, MultiSelect, Combobox, Command, DropdownMenu, NavigationMenu, the
  icon grid — is the neutral `--ds-color-fill-hover`. The accent tint means
  selected or current (a DropdownMenu's current item, a NavigationMenu's
  active link, the chosen icon) and keeps its tint while highlighted, because
  accent text on the grey fill falls under 4.5:1. Select marks its selected
  item with a check in a reserved column, as MultiSelect does.
- **Targets are at least 24px** (WCAG 2.5.8), and 44px on touch (the touch
  scale, [Tokens](tokens.md#tokens)). A control drawn smaller — the InfoTip glyph, a chip's remove
  button, the Slider thumb — keeps a box of `max(1.5rem, --ds-target-min)`
  around the glyph and pulls it back into its line with negative margins (or,
  for the thumb, draws the knob as a centred `::before`), so the layout keeps
  the glyph's footprint and the focus ring circles the target.
- **Motion**: primitives animate freely; the one `prefers-reduced-motion`
  block in `app.css` shortens every animation and transition to a near-zero
  duration (not `none`, so the end events Bits UI's presence handling waits
  for still fire). A primitive adds no reduced-motion rule of its own — with
  one exception, `Spinner`, whose arc would freeze into a static glyph under
  that rule: it drops the rotation and pulses its opacity instead.
- **Dialog height**: a `Dialog` is bounded to the viewport (`max-height:
  100dvh − 2rem`) and its body scrolls when content is taller, title and
  footer staying put — a modal must never grow off screen. There is no
  opt-out, and consumers must not add height/overflow rules of their own on
  the content. What a consumer may choose is *what* scrolls: `body="fill"`
  (Dialog and BottomSheet alike) makes the body a column that never scrolls
  itself, its one child shrinking to it (`flex: 1 1 auto; min-height: 0`)
  and scrolling a part of its own — a picker keeps its search field in place
  while only its list scrolls. The corollary: a dropdown inside a dialog must be a floating
  layer in its own right (portalled to `document.body`, Floating UI-positioned,
  z-index above the dialog, a Bits UI layer so a click inside it is not an
  outside click for the dialog) — `Select`, `Popover`, `DropdownMenu`, `Tooltip`
  and `Combobox` all are. An absolutely positioned child of the body is clipped
  by the body's scroll box, and any "make the body overflow visible" workaround
  only moves the clipping to the next scroll container up.
- **Style escape hatch**: `class: className = ''`, spread onto the root
  element.
- **Close-auto-focus escape hatch**: `Popover`/`DropdownMenu` accept an
  optional `onCloseAutoFocus?: (event: Event) => void`, forwarded to Bits
  UI's own `Content`. Unset, Bits UI's default applies (refocus whatever had
  focus when the panel opened). A caller that already moved focus elsewhere
  as part of its own close-triggering action (e.g. back into a text editor)
  can call `event.preventDefault()` to keep that focus instead of having
  Bits UI silently steal it back — [Composing panels next to a live text
  editor](patterns.md#composing-panels-next-to-a-live-text-editor) says when this matters.
- **Trigger `disabled`**: `Popover`, `DropdownMenu` and `Tooltip` (its
  `trigger` shape) accept `disabled?: boolean`, forwarded to Bits UI's
  `Trigger`. The `trigger` snippet's own content can't carry a native
  `disabled` attribute (it renders inside Bits UI's real trigger button, not
  as one itself), so route disabling through this prop rather than disabling
  the snippet's inner element. The primitive dims its trigger button when
  disabled, so a consumer's snippet needs no disabled look of its own.
- **Toggles in a menu**: an on/off `DropdownMenuItem` takes `checked` (Bits
  UI's `CheckboxItem`: `role="menuitemcheckbox"`, `aria-checked`, a leading
  check), with `onSelect` flipping the consumer's state and `checked`
  reflecting it back one-way. `active` is only the "current one" look of a
  plain command and is not announced — never an on/off state.
- **Groups in a menu**: a menu that gathers commands of different kinds (the
  editor's Insert menu: the blocks, the collection and document families,
  an integration's other blocks) wraps each kind
  in a `DropdownMenuGroup` whose first child is a `DropdownMenuGroupHeading`
  — a small muted label, not an item: the arrow keys pass over it, and it
  names the group (`role="group"`, `aria-labelledby`) for assistive tech. A
  separator between groups stays where it was; the heading is what says what
  follows.

## Styling Bits UI wrapper primitives

Every primitive that wraps a Bits UI component (`Popover`, `DropdownMenu`,
`DropdownMenuItem`, `DropdownMenuSeparator`, `Command`, `CommandInput`,
`CommandItem`, `Dialog`, `BottomSheet`, `Select`, `MultiSelect`, the toolbar
and segmented families) uses Bits UI's `child` snippet render-prop — rendering our own
literal element (with Bits UI's computed `props` spread onto it) instead of
passing a `class` string into Bits UI's default render:

```svelte
<BitsPopover.Trigger {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <button {...props} class="ds-popover-trigger">
      {@render trigger()}
    </button>
  {/snippet}
</BitsPopover.Trigger>
```

This is deliberate, not decoration: if a class is instead passed as a string
*prop* into a Bits UI component (`<BitsPopover.Content class="...">`), Bits
UI renders the actual DOM node inside its own compiled component — a
different Svelte file's template — where this component's scoped-CSS hash
can never reach it, forcing every selector onto `:global(...)`. With `child`,
the element is literal in *this* file's own template, so plain scoped
selectors work normally; a spread (`{...props}`) doesn't prevent Svelte's
scope hash from attaching (confirmed by reading the compiler itself —
`svelte/src/compiler/phases/2-analyze/css/css-prune.js`'s `SpreadAttribute`
handling and `phases/3-transform/client/visitors/shared/element.js`'s
`attribute_effect` — a spread-bearing element is always treated as a
possible selector match, and gets the hash class attached the same way a
literal `class="..."` element does).

Each `child` snippet is itself a Svelte control-flow boundary, so this
pattern is one of the contributors to the hydration comment anchors described
in [architecture/overview.md](../overview.md#hydration-comment-nodes) — expected, not
a bug.

Content-shaped components (`Popover.Content`, `DropdownMenu.Content`) hand
`child` *two* prop bags via `{#snippet popper({ props, wrapperProps })}` —
`wrapperProps` (the outer floating-ui position box: transform, z-index, CSS
vars) and `props` (the inner styled panel: `data-state`, focus/pointer
handlers). Render these as two nested elements, matching Bits UI's own
default two-`<div>` shape — merging them onto one element risks breaking
floating-ui positioning, since the transform lives specifically on the
wrapper. `CommandInput` has one behavioral gotcha: once `child` is used,
Bits UI's own `bind:value`-carrying `<input>` never mounts, so the
hand-authored `<input>` must carry `bind:value` itself, bound to the same
`value` variable already forwarded into `BitsCommand.Input`.

New Bits UI-wrapping primitives should follow this pattern from the start —
`:global()` is essentially never structurally required here, only a
shortcut. A scoped primitive rule outranks a consumer's class on the same
element, so a variation a consumer needs (a dialog's width, a compact
picker) is a prop on the primitive — `Dialog`'s `size`, `Select`'s `size` and
`width` — never a `class` plus an override rule. `Button`/`Input`/`Textarea` (no Bits UI involvement) and Select's
`.ds-select-chevron` (its own literal `<svg>`) don't need this at all — the
pattern only applies where a class needs to land on a Bits-UI-rendered
element.

**Don't borrow a primitive's internal class name as a styling shortcut.** A
consumer that can't use a primitive directly (menu items outside a
`DropdownMenu.Root`, whose context `DropdownMenuItem` needs) must not reuse
a primitive's own internal class name (`.ds-menu-item`, `.ds-menu-separator`,
etc.) on its own elements hoping to inherit that primitive's styling: those
classes are scoped to their own component, so another file's elements never
match them. If you need
the same *look* somewhere that can't render the actual component, give the
consumer its own locally-scoped classes with their own name — a small
duplication, but an honest one, versus an invisible cross-file dependency
that breaks the moment the primitive's CSS is touched.

## The primitives

One section per primitive that has more to say than its
[catalogue](overview.md#catalogue) row, in the catalogue's order: what it is
for, and the reasons behind its shape.

### Spinner

`Spinner` is indeterminate progress: a faint ring with a turning arc in
`currentColor`, so it is white inside a primary Button and muted beside a
status line. It is decorative by default, because the busy thing announces
itself; `label` turns it into a `role="status"` with that name for the rare
case where the spinner is the only sign of progress. Its usual home is
`Button loading`: the label stays in the layout at opacity 0 — keeping the
button's width, so nothing beside it jumps, and keeping the label as the
accessible name — the spinner is centred over it, and the button is
`aria-busy` and disabled against a double submit but not dimmed, since a
button that is working is not unavailable. An upload started from a button
shows its progress on that button, not in a separate "Uploading…" line.

### CodeArea

`CodeArea` is the field for source a person writes by hand: a highlighted
`<pre>` under a transparent-text `<textarea>`, the two locked together by
declaring every metric that positions a glyph once on the shared wrapper. It
stays a textarea rather than a `contenteditable` so the browser's own editing,
undo stack, form participation and accessibility come free, and the highlight
is decoration the accessibility tree never sees. Highlighting arrives as a
`highlight` callback the consumer passes, the same way this layer takes its
labels — the language grammars live with the content feature, which owns code
rendering, so a page that wants a plain code box does not pull them in. Its
ground is dark in both schemes (`--ds-code-bg`, a static token because it does
not vary): the `.hljs-*` palette is one fixed dark set, and half of it lands
near 2:1 on a light field. Disabled dims the two layers rather than the frame,
so the code is still measured against the dark ground it actually sits on and
not against a composite of the page behind it. **Tab moves focus and does not
type an indent** — an indent would make the field a keyboard trap, and the
usual release (Escape, then Tab) is unavailable in its main home, a `Dialog`,
where Escape closes the dialog and takes the unsaved edit with it. Prose is a
`Textarea`; read-only rendered code is a code block, not this.

### SearchField

`SearchField` (`src/lib/design-system/SearchField.svelte`) is a page's
search term with its submit inside the field: a framed native `type=search`
input (a searchbox; Enter submits its form, and `name` posts the input
itself) and an icon button that submits too, so no "Search" button needs
room beside it and the field takes its row's whole width on a phone. It is a
styled composite, not Input with a slot, because Input's root element is the
input. The frame is a control height tall, border included, so it lines up
with the Buttons and Selects of a row; the ring goes on the frame while the
input has focus (`:has()`, not `:focus-within` — the submit is focusable and
rings itself), the composite-frame exception; the submit fills the frame's
height and is as wide as a control is tall, a 44px target on touch.

### Select and MultiSelect

`Select` and `MultiSelect` take their options either flat (`items`) or
**grouped** (`groups`: labelled sections, rendered through bits-ui's
`Select.Group`/`GroupHeading` via the `child` pattern). Grouping is a
DOM-only concept for bits-ui — its `Root.items` stays the flat list, which
is what resolves the trigger's label for the current value and drives
typeahead — so a grouped picker flattens its groups for `Root` and only
renders the sections inside the viewport; a value from any group therefore
labels the trigger correctly before its item has mounted. `width="full"`
stretches the trigger to its container and ellipsizes the value, for a
picker sitting in a grid cell or form row. The query builder's source picker
(Fields / Properties / Tags / Class / Relationships) is a grouped
consumer. `Dialog` has a fourth size, `xl` (720px), for a builder that lays
its controls out in columns.

### Combobox

`Combobox` (this design system's own, `src/lib/design-system/Combobox.svelte`
— not bits-ui's) is deliberately hand-rolled, not built on bits-ui's
`Combobox`. Confirmed by reading `bits-ui`'s `combobox.svelte`/`select.svelte.js`
directly: bits-ui's `Combobox` is literally `Select`'s own state machine with
an `isCombobox` flag — its Enter-key handling only ever commits an
already-highlighted, list-matched item (`SelectInputState.onkeydown`), with no
path for arbitrary typed text to become the value. Every consumer of this
component (tag names, attribute names, font size) needs exactly that missing
capability — committing free text that isn't in the suggestion list — so a
wrapper around bits-ui's version would silently break "type a brand-new tag."
Its styling is still kept in sync with `Select.svelte`'s `.ds-select-trigger`/
`.ds-select-content`/`.ds-select-item` values by hand (small deliberate
duplication, not a shared rule — see the file's own top-of-script comment),
including copying bits-ui's own `select-viewport.svelte` scrollbar-hiding
technique, so the two read as the same primitive family despite the different
internals. Its suggestion list, though, is *not* hand-positioned: it renders
as a bits-ui `Popover.Content` floating layer anchored to the input via
`customAnchor` with no `Trigger` (the same mechanism `Tooltip` uses) — the
input keeps focus and owns opening/closing, so the layer's focus trap,
auto-focus, outside-click and Escape handling are all switched off — which
is what lets the list escape any scroll container (a dialog body, the
block settings panel) and still count as a child layer of a surrounding Dialog or
Popover.

### ChipInput

`ChipInput` is the multi-value input: chosen values as chips, plus a text
entry with autocomplete for the next one, free text allowed. It composes
`Combobox` for the entry — the same "commit text that isn't in the list"
requirement that made Combobox hand-rolled — and draws the field chrome
itself, the inner input going borderless through Combobox's `--combo-*`
CSS-var hooks. Two Combobox props exist for this host: `commitOnBlur={false}`
(a half-typed value must never become a chip when the author tabs to the
next control — only Enter or picking a suggestion adds one) and `onKeydown`
(Backspace in an empty entry removes the last chip). Chip remove buttons
`preventDefault` their mousedown so focus stays in the entry, and are named
from the required `removeLabel` (the consumer's translated "Remove"). The
query builder's tag condition uses it.

### Slider

`Slider` (`src/lib/design-system/Slider.svelte`) wraps bits-ui's Slider in
single-thumb mode through the `child` pattern (root, range and thumb are all
literal elements here; bits-ui supplies their positions as inline styles in
`props`). `value` is `$bindable` like Switch's `checked`; `onValueChange`
fires per step while dragging and `onValueCommit` once on release, so a
consumer with an expensive reaction can pick the latter. `min`/`max`/`step`
are plain numbers, `ariaLabel` names the thumb. It is a continuous numeric
control for a bounded setting — a value with a small closed set of options
is a `SegmentedControl` or `Select`, not a slider. The graph view's force
sliders use it ([graph-view.md](../graph-view.md)).

### Checkbox and RadioGroup

`Checkbox` and `RadioGroup` are the two choice controls a form was missing
(both Bits UI, both rendered through the `child` snippet). A **Checkbox** is
one on/off choice that is submitted or saved together with others — a member
of a namespace, a user to share with, a block to keep — where a `Switch` is a
setting that takes effect at once. Its label is its children, rendered inside
the control like Switch's, so the whole row is the target and the label
(with secondary text such as an email) is the accessible name; without a
label it keeps a 24px box. `name` + `value` post it like a native checkbox,
several with one name posting the checked values as a list, and
`indeterminate` marks a partly-checked parent. A **RadioGroup** is one value
from a short labelled list in a form where other fields depend on it (a link
pointing to a page or a URL): arrow keys move between options as the radio
pattern requires, and inside a `FormField group` the field's label names the
group through the form-field context. Two to four options shown inline and
applied at once stay a `SegmentedControl`; a longer list is a `Select`. Both
draw their unchecked edge in `--ds-color-border-strong`, since that edge alone
carries the state, and step through the interaction tokens on hover and press.

### PositionGrid

`PositionGrid` picks where a cropped picture anchors: nine cells in a 3×3
grid, each drawing its dot where the picture holds — the image block's focal
point and a background image's focus. It is a two-axis choice no segmented
row lays out, so it is its own primitive rather than nine buttons per
consumer. Like `SegmentedControl` it is Bits UI's ToggleGroup with a one-way
`value` and the same click and Enter/Space guards, so arrow keys move between
the cells and the selected cell is announced; the cells are 24px targets, and
the selected one wears an inset ring, since an outward one would bleed into
its neighbours. The cells' names are a `labels` prop — the layer has no i18n.

### FormField

`FormField` is one field of a form a user fills in and submits — the add/edit
form in a settings page's `Dialog` is its home: the label above the control
(`--ds-text-sm`, muted), an optional `hint` below it (`--ds-text-xs`), and the
field's own `error` (danger, with a glyph) — or a `warning` for a value that
is allowed but has a consequence worth knowing (raising a namespace's access
level makes the pages that inherit it visible too), which describes the
control without making it invalid, as `FieldRow`'s `warning` does in a panel. It is the form grammar's
counterpart of `SettingsRow` and `FieldRow`, which name a *setting*; this
labels an *input*. The wiring is the point: a FormField publishes a small
context (`formField.ts`) with the control's id, the hint and error ids and
whether it is in error, and every design-system control that can sit in a
form — Input, Textarea, Select, MultiSelect, Combobox, NumberField,
ChipInput — reads it and sets its own `id`, `aria-describedby`,
`aria-invalid` and danger border, so
`<FormField label={…} error={…}><Input name="slug" /></FormField>` is
complete. Props passed to the control directly win over the context; a Select
inside a field names its listbox by the field's label, so it needs no
`ariaLabel`. A raw element the context cannot reach (a native `<select>`, a
file input) takes the same values from the snippet argument
(`{#snippet children(field)}<input id={field.controlId} …>`). `group` is
for a field that is not one control — a radio pair, a picker with its buttons:
the label names a `role="group"` and no id is handed down, so controls in a
cluster never share one; a control that composes another (ChipInput's
Combobox entry) clears the context for its children. Required is the norm in
these forms, so a required field shows no marker (its control carries
`required`), and an optional one shows `optionalLabel` — the consumer's
translated "(optional)", which is part of the accessible name. Layout is the
form's: stacked with `--ds-space-sm` between fields, or a two-column grid
whose full-width fields are wrapped in a spanning cell. A form's action error
is an `Alert` above the footer, never a field error.

### LocalizedTextField

`LocalizedTextField` edits one text in several languages — a name that is
stored per language, which is what every schema label is
([languages.md](../languages.md)) — on **one line**, however many languages are enabled:
a `Select` picks the language being edited, an `Input` (or a `Textarea`,
`multiline`, for a description) edits it. The field holds the whole map, so
switching languages never loses an edit. Gaps stay visible without opening
the select: each option carries its state through the Select's `trailing`
slot — the required language marked, an untranslated one "missing", a
translated one checked — and a warning `Badge` beside the row counts the
translated languages while one is missing (a field that is empty everywhere
and requires nothing is not missing anything). The consumer passes the
languages in display order, the author's own first, and marks the one that
must be filled; the field starts on that one while it is empty. `copyFrom`
offers to fill an empty language from another's text (the English one, in
the app). Every language keeps a **real input that posts `<name>.<code>`
itself** — the edited one visible, the others `hidden` — so a plain
`<form method="POST">` receives every translation (no mirror inputs), and
the server reads them back with one helper (`localizedTextFromForm`); text in
a language the consumer did not pass (a disabled one) is posted the same way
and kept, with `preservedNote` saying so. There is no native `required` — a
hidden input cannot show the browser's message — so the consumer gates
saving and the server refuses; an `error` turns the select to the required
language and marks its input invalid. The visible input's accessible name is
"<field label> <language>". Like every primitive it imports no i18n: every
word is a prop; the semantic feature's `LocalizedField` binds it to the site's enabled
languages and the chrome's messages.

### The narrow-panel controls

`FieldRow`, `NumberField`, `CollapsibleGroup`, `ColorPickerField`,
`IconPickerField` and `InfoTip` are the narrow-panel block settings controls — the row
grammar the editor's block settings panel renders every block setting through
(described with its consumer in
[blocks/capabilities.md](../blocks/capabilities.md#where-capabilities-are-edited)). Like
`SettingsRow`, `FieldRow` is a layout primitive with no bits-ui inside and
no i18n: label, hint and help text are plain string props.

- **FieldRow** is one setting: a label line (label, an optional muted
  `hint` such as the resolved default, an optional `info` behind an ⓘ
  tooltip, an optional `trailing` action) and the control. `layout="inline"`
  puts the control right of the label on one line, for controls up to
  ~120px wide (a switch, a number field, a colour or icon trigger, a short
  select, a two-to-three-item segmented control); `layout="stack"` puts it
  full-width beneath, for word-labelled or four-plus-item segmented
  controls, full-width selects, text inputs, grids and button rows. `for`
  ties the label to one control's id; without it the row is a labelled
  group. `error` puts a `FieldError` under the control, across the row, and
  publishes the same context as `FormField` minus the id, so the
  design-system control in the row sets its own `aria-describedby`,
  `aria-invalid` and danger border. `warning` puts a `FieldWarning` in the
  same place and describes the control with it, but leaves it valid: the
  value is allowed, the row only says what it leads to.
- **NumberField** is a short numeric box with the unit drawn inside the
  frame (`unit="px"`). It is not built on `Input` — that one is
  deliberately `width: 100%` with no adornment slot, the opposite of what a
  number beside a label wants. Commit-on-change (`bind:value`, or `value` +
  `onValueChange`): `null` means unset and shows the `placeholder`
  (typically the resolved value); a commit clamps to `min`/`max` and rounds
  to whole steps.
- **CollapsibleGroup** is one flush titled section (bits-ui `Collapsible`
  through the `child` pattern) with a leading chevron, a sentence-case title
  and an optional `modified` dot; sections stack with a hairline between
  them. It is deliberately not `Accordion`: that is a framed group whose
  open state lives on the group, the wrong shape for a column of
  independently collapsible sections whose state the consumer keeps.
- **ColorPickerField** and **IconPickerField** are the space-saving forms of
  a colour and an icon setting: a compact trigger (swatch + value, or the
  current glyph) opening a `Popover` with the palette (`ColorField`) or the
  curated quick-link icon grid (`icons.ts`). `ColorPickerField` takes the
  `resolved` colour so an unset field still previews what renders, muted.
  With `custom={false}` either field offers its theme colours alone — no
  palette, no free picker — for a setting that must stay a colour that
  follows the scheme (a page's background, [blocks/layout.md](../blocks/layout.md#page-settings)).
- **ScaleField** is ColorField's shape for a value on a named scale: a
  labelled group of steps first, a labelled custom entry (a `Combobox`
  number) second — the scale is the choice, the number the escape hatch. Each
  step is a native `aria-pressed` button that draws its name at the
  consumer's `preview` size with its real value muted beside it, so the list
  shows the scale's order and growth. The preview is bounded, not the real
  size: the type scale passes a compressed ramp, since real display sizes make
  a list taller than any popover. It is a static length, never a token that
  resolves against the page canvas: the field portals out of the canvas it
  would measure against. The custom box shows only a number, so it
  reads empty while a step is chosen; an empty commit clears only a custom
  value, because the Combobox commits on blur and tabbing through must not
  drop a chosen step. The font-size picker is the consumer
  ([typography.md](../typography.md)).
- **InfoTip** is the ⓘ glyph whose `text` is a Tooltip on hover/focus and
  the trigger's accessible name. It is a *toggletip* (Tooltip's `toggle`): a
  click or a tap pins it open, because a finger has no hover and its help
  must still be reachable on a tablet.
- **SegmentedControl** takes `size="sm"` and `stretch` (fill the row, items
  sharing the width). Item sizing travels as custom properties set on the
  root and read by the item's own scoped CSS — the items live in another
  component's template, so a descendant selector would have needed
  `:global()`. Both sizes come to exactly `--ds-control-h-sm`/`-md`: the
  items are the control height less the root's 1px border on each side.
  A stretched control squeezed into a narrow column truncates each label
  with an ellipsis inside its item (give the item a `title` for the full
  label). `Select`, `Combobox`, `ChipInput` and `Switch` have the matching
  `size="sm"`; `Switch` takes `ariaLabel` for the case where its visible
  label is the row's.

### FieldError

`FieldError` is a field's error text: a danger glyph and the message, the
one line for "this value is wrong". `FormField` and `FieldRow` render it from
their `error` prop and wire the control to it; a control outside both — a
popover's name input, the editor header's inline title and slug, a file
picker row — renders `<FieldError id=… message=… />` itself and points the
control at it with `aria-describedby` and `aria-invalid`. A field error stays
until the value is fixed, so a rejected value is kept where the user typed it:
the header's inline-edit field reopens with the rejected text, invalid, and
takes focus back only when the commit came from Enter.

### SettingsGroup, SettingsRow and SettingsWell

`SettingsGroup`, `SettingsRow` and `SettingsWell` are the settings
pages' content pattern — a titled group of label-and-description-beside-control
rows, plus the one inset preview surface — described with their consumer in
[settings.md](../settings.md). They are layout primitives with no bits-ui
inside (like `Input`), token-only, and know nothing about routes or
messages: labels and descriptions are plain string props.

### Table

`Table` (`src/lib/design-system/Table.svelte` + `TableRow.svelte` +
`TableCell.svelte`) is the list primitive for every list on a settings page
([Settings pages](patterns.md#settings-pages)). Column sizing is *declared*, never
measured: `Table` takes a `columns` array (label, optional width, alignment,
`hideLabel` for an actions column) and renders it as a `<colgroup>` over a
`table-layout: fixed` table, so a column's width comes only from its `<col>`
(unset = an equal share of the remainder), never from cell content, so no
column jumps when a save or a delete changes what a row holds. Rows share
one fixed height; a long value opts
into `TableCell`'s `truncate` (with `title` carrying the full text) rather
than wrapping. `TableCell` also offers `mono` (an identifier chip), `muted`,
`nowrap`, `align`, `indent` (tree rows: steps the content in per level and
marks nested rows with a branch glyph — the classes catalogue), and `actions`
— the last renders a right-aligned flex
cluster *inside* the `<td>`, because putting `display: flex` on the `<td>`
itself turns it into an anonymous-cell flex box that no
longer aligns with its row. `TableRow` takes `tone="muted"` for a
structurally different row (a locked core entry among editable ones) and
spreads rest props, so a consumer can hang a `data-id` on a row. Rows and
cells are sub-components, not `:global()` rules, for the same reason as
every other primitive here: a consumer's raw `<tr>`/`<td>` lives in another
file's template, out of reach of this file's scoped CSS — which is also why
their looks are props (`tone`, `indent`), not consumer classes. The house responsive pattern is
**horizontal scroll inside the table's own wrapper plus a sensible
`minWidth`**, not card reflow: admin configuration is desktop-dominant and
reads tabularly, and settings routes render full-bleed in the settings
shell's pane (`main.settings-route`, `src/routes/+layout.svelte`) so the
table rarely needs to scroll on a desktop viewport at all. It does not sort:
sorting, when a list needs it, is added to the primitive, not per page. A
list too long for one screen pages with `Pagination`.

### Pagination

`Pagination` (`src/lib/design-system/Pagination.svelte`) steps through a
long result list a page at a time. Every page is a plain link the consumer
builds (`href(page)`), so a page is a URL: it can be bookmarked or opened in a
new tab, and Back returns to it. The current page is marked
(`aria-current="page"`, the accent tint that means selected) rather than
linked, and previous/next are left out at the ends instead of disabled — a
disabled link still navigates. Which numbers show is `pageWindow`
(`pagination.ts`): the first and the last page, the current one and its
neighbours, and a gap only where it stands for two pages or more. The
primitive is a container query: below 32rem the row shortens to the current
page between the first and the last, with previous/next as their glyphs, so it
fits a phone without wrapping. Both rows are rendered and the container shows
one; the other is `display: none`, out of the accessibility tree.

### Alert

`Alert` is the one shape for a message about the state of what the user
is doing — an action failed (`danger`), a caveat applies (`warning`), a note
worth reading first (`info`), it worked (`success`). The tone is carried
three ways, so it never rests on colour alone: the tone colour, a glyph
(alert-circle, alert-triangle, info, check), and the accessible role —
`danger` is `role="alert"`, announced at once, the other tones
`role="status"`, announced politely. A consumer renders it conditionally
(`{#if error}<Alert tone="danger">{error}</Alert>{/if}`) so the message is
announced as it appears. `layout="inline"` is a box inside a form, a dialog
body or a page, with a hairline in the tone because the soft grounds sit at
about 1:1 against the page; `layout="banner"` is flush and full width,
topping the surface it is about (the editor's lock-lost notice). `title` is
a bold lead-in and `actions` holds `size="sm"` Buttons acting on the message
(Remove a conflicting property, Copy a created link). It has no outer
margin — the surrounding layout places it — and carries no text of its own.
A form's action error sits in the dialog body above the footer; a settings
page's action error comes through `SettingsPageHead`'s `error`. A message
about a single field is not an Alert but that field's error text.

### Toast

The last row of [Where an error goes](patterns.md#where-an-error-goes) is a toast:
`toast.error(message, { action })` — or
`warning` / `info` / `success` — called from client code, rendered by the one
`Toaster` the root layout mounts. The behaviour lives in `toast.svelte.ts` so
every toast behaves alike. An error stays until dismissed: a message that
leaves on a timer can be missed, and reading it must not be timed. The other
tones leave after five seconds, and hovering or focusing the stack pauses
every timer. At most three show; later ones wait their turn, and the same tone
and message again restarts the existing toast instead of stacking a copy. A
toast never takes focus. Its optional action (Try again) and its close button
are ordinary buttons, placed after the page in the tab order, and Escape
inside the stack closes the newest. Announcement goes through two visually
hidden live regions present from the first render — assertive for errors,
polite otherwise — because a region inserted together with its text is often
not read out. They are `aria-live` regions with no role: an always-present
`role="alert"` would answer every search for the page's own alert. The stack reads as a white surface with the tone on the glyph,
so the message stays body text; `--ds-z-floating` puts it above dialogs. A
success toast is only for an outcome nothing visible confirms: when the page
already changes (a dialog closes, a row appears, a button says Copied), the
change is the confirmation. Module state is per browser tab; on the server
every call does nothing.

### EmptyState

`EmptyState` is what a list, table, panel or search shows when it has
nothing to show: one muted line saying so and, where there is an obvious next
step, the action beside it (`actions`, a `size="sm"` Button).
`layout="inline"` sits flush where the list would be — a
list page's else branch under its head (the Add action lives there, not
repeated here), a settings row, a panel; `layout="centered"` fills a results
area or a graph with a padded, centred line. `size="md"` is page-level text,
`size="sm"` a dense surface (a settings row, the block settings panel, a picker's list).
`live` makes it `role="status"`, for an empty state that appears in response
to typing or filtering — no search results, no picker matches — so a screen
reader hears it; a static empty list is not live. The message may carry inline
markup (a link to where the missing thing is set up). An instruction next to a
field is a hint, not an empty state; an action that failed is an `Alert`.

### Badge

`Badge` is a small static inline label next to a name (a declared
datatype, an "HTML" origin, a change's kind, a status); its `tone` is
neutral, accent, info, success, warning or danger. A removable value is a
chip (ChipInput), not a badge.

### Card

`Card` (`src/lib/design-system/Card.svelte`) is the surface for one item
among many shown side by side or stacked — a search result, a browsed page.
It is static: the card is not a control, the link inside it is, so a grid of
cards is one tab stop per card and the focus ring is the link's own; being
the card's target, that link measures `--ds-target-min` (44px on touch) like
any target that isn't a sized control. Hovering
that link lifts the card's border (`:has(a:hover)`), never its fill. `as`
picks the element (`article` for a self-contained result, `li` inside a
list), `size="sm"` is the dense spacing — which an `md` card takes on a phone
too (`PHONE_SHELL_MEDIA`), where the roomy padding costs a column too much;
the content lays out top to bottom with the card's gap and breaks long
words. It is the one place a card look
lives — settings stay rows, settings lists stay a `Table`, and an inset
preview is `SettingsWell`; a grid of cards is for content someone browses, not
for configuration. In a grid, the cards of a row stretch to the tallest (a
grid's default); a consumer that wants a row's last lines to align pins its
card's foot with `margin-top: auto`, as the search page's cards do.

### Tabs

`Tabs` (`src/lib/design-system/Tabs.svelte` + `TabsTrigger.svelte` +
`TabsContent.svelte`) wraps bits-ui's Tabs (Root + List in `Tabs`, Trigger,
Content) through the `child` pattern. Two uses are supported. Plain panel
swap: `bind:value`, triggers without `href`, one `TabsContent` per value —
the in-page use the primitive is kept for. **Route navigation** (no consumer
today: the settings navigate by a sidebar, [settings.md](../settings.md)):
`value` is derived one-way from the current path, triggers carry `href` and
render as real `<a>` elements (through `child`, so the no-JS fallback and
SvelteKit's client router both keep working — bits-ui's trigger `onclick`
never calls `preventDefault`, and the router only skips clicks that were),
and the routed page renders inside a single `TabsContent` for the current
value so the tablist/tabpanel relationship is honest. Keyboard is the one
place a link tab needs help: bits-ui's `onkeydown` `preventDefault()`s
Enter/Space *before* activating, which on an anchor would swallow the
navigation, so `TabsTrigger` passes its own `onkeydown` as a prop — merged
first, and `composeHandlers` stops once an earlier handler has prevented the
event — that intercepts Enter/Space and re-dispatches a native `click()`.
Keyboard activation then takes exactly the pointer path (bits-ui's activate
plus the link router), and the design system stays free of `$app/*`
imports (a `goto()` here would have coupled it to SvelteKit). Use
`activationMode="manual"` for navigation tabs: with `automatic`, merely
arrow-keying focus across the tabs would activate — and so navigate — on
every focus.

### SortableList

`SortableList` (`src/lib/design-system/SortableList.svelte`) is an order
its user rearranges — a curated collection's members. Every item has a
handle, a ghost icon `Button` its `item` snippet places where the row wants
it, and the item moves two ways that reach the same `onMove(from, to)`: by
dragging the handle — pointer events, so mouse, pen and finger alike, the
handle claiming the touch (`touch-action: none`) so the page does not scroll
under a finger, the row following the pointer and a line marking where it
lands — or by the keyboard, the handle focused, ↑ and ↓ moving it one place.
A keyboard move keeps the focus on the moved item's handle (the row moved in
the DOM) and is announced in a polite live region with the consumer's words
(`announce`), and the handle's `instructions` are read with it. The list
draws what it is given: the consumer reorders its items, so a move it
refuses simply never shows. The row follows the pointer through a `style:`
transform that only the browser sets — nothing reaches the server render,
the strict style-src holds. A narrow screen offers moves in the row's own
menu too (the consumer's), since a drag needs a steady finger. No drag
library: the one gesture is a handle's vertical drag, which needs none.

### Accordion

`Accordion` (`src/lib/design-system/Accordion.svelte` +
`AccordionItem.svelte`) wraps bits-ui's Accordion `type="multiple"` only —
its consumers (`QueryBuilderModal.svelte`'s pipeline sections,
`PagePropertiesDialog.svelte`'s class fields) need sections open
independently, not the mutually-exclusive single-open behavior
`type="single"` gives. `AccordionItem` flattens Item+Header+Trigger+Content
into one titled-section component, the same "don't expose raw sub-parts
when every consumer wants the same shape" reasoning as `DropdownMenuItem`.
Trigger and content share one horizontal inset so a section's body aligns
with its title and neither touches the group's border. `size: 'sm' | 'md'`
(per item, like Button): `md` for a modal's primary sections, `sm` — smaller,
medium-weight, muted at rest — for a secondary, collapsed-by-default section
sitting among a dialog's own labels and inputs.

### ConditionGroup

`ConditionGroup` is the group block of a filter/rule builder: a header
carrying the group's combinator (all / any — AND / OR, a `SegmentedControl`;
the labels are props, since this layer imports no i18n), the members below
it, an optional `label` naming the group (so an optional, still-empty group
reads as what it is), an `actions` snippet in the header and a `footer`
snippet for add buttons. It is domain-free — the consumer renders its rows and, for nesting,
itself recursively into `children` — and `depth` is what makes a tree read
as one: the root has no frame, a nested group is an indented block with a
left rule and a faint surface. The query builder's condition groups use it
(the root filter, a traversal step's target filter).

### Tooltip

`Tooltip` (`src/lib/design-system/Tooltip.svelte`) has two shapes. One
consumer (the graph view's typed-edge hover card,
`src/lib/features/graph/components/GraphView.svelte`) has no real DOM trigger to
attach to (an SVG line that moves under a live force simulation and pan/zoom
transform), so it's used fully controlled: `open` driven externally, position
driven by `customAnchor` — a real element, selector, or a bits-ui `Measurable`
(`{ getBoundingClientRect() }`) virtual reference, the same mechanism
Popover/Select/DropdownMenu content already share. Confirmed by reading
`bits-ui`'s `tooltip.svelte.js` state machine directly: **all of bits-ui's
hover-delay timing (`delayDuration`, the provider's skip-delay grace period)
lives in `Tooltip.Trigger`'s own pointer-event handlers** — driving `open`
externally with no `Trigger` rendered bypasses that machinery entirely, so
open/close become instant rather than merely fast. Also confirmed
empirically: a virtual `customAnchor` is only re-measured at the moment
`open` transitions false→true (nothing observes a bare rect change on a
non-DOM anchor while already open) — fine for a hover card that opens fresh
per edge, not suitable as-is for a tooltip that must track a moving anchor
while staying open continuously. The second shape is the optional `trigger`
snippet: when given, a real `Tooltip.Trigger` button is rendered (caller-
styled like Popover's, `triggerProps` merged onto it for an aria-label) and
hover/focus open the tooltip with bits-ui's own delay handling. `InfoTip`
is that shape's consumer. bits-ui ignores touch pointers on the trigger and
closes the tooltip on a trigger click, so on a phone or a tablet that shape
alone never opens; `toggle` adds the tap path: a click or a tap pins the
tooltip open — hover leaving and the trigger's blur no longer close it —
until a second click, Escape, a click outside or the trigger losing focus to
the keyboard. Pinned, the bubble takes pointer events, so a tap on it never
reaches the control underneath.

### BottomSheet

`BottomSheet`'s optional `footer` holds a sheet's actions below its
scrolling body, always in view — a filter sheet's Reset and "Show N results"
— the way Dialog's footer does; the sheet already sits on the on-screen
keyboard, so the footer needs no inset of its own. Its header can carry a
short state beside the title (`actions`, outside the title so the dialog's
name stays the title — a count of active filters) and a close button
(`closeLabel`), for a sheet long enough that its handle alone doesn't read as
dismissible; like the title, they sit above the scrolling body and never
scroll away. `size="lg"` lets a long panel rise to all of the screen but a
strip of backdrop at the top (`--ds-sheet-gap`, the bottom bar's height),
minus the top safe area and the keyboard; the default `md` stops at 80%.

A sheet has **pages** (`sheetPage.ts`): a part of its content that would
open a layer of its own — a settings panel's picker — asks the sheet around
it (`getSheetPageOutlet()`) to show a page instead, so a phone never stacks a
dialog on a sheet. The page takes the sheet's title and body, a back button
leads the header, and Escape steps back rather than closing; the content
stays mounted underneath, hidden, so it is as it was, and focus returns to
what opened the page. A page takes the focus as it opens (its first control,
unless something in it took the focus already), and the sheet's footer,
which belongs to the content, waits under it. The node picker is the
consumer: inside a sheet it is a page of it.

### Command

`Command` is a plain composable "cmdk-style" tree with no modal chrome of
its own (no open state, no backdrop, no focus trap) — it is composed inside a
`Dialog`, a `Popover` or a sheet, never used standalone. Its parts:

- **`CommandSearch`**, the search field: a frame holding a search glyph, the
  field and, once something is typed, a clear button — the whole row wide by
  itself, so no consumer wraps it in a flex row of its own. The frame rings
  while the field has focus (`:has()`, the composite-frame exception: the
  clear button rings itself). Escape on a typed term clears it and goes no
  further; on an empty field it reaches the layer around, which closes. The
  clear button hands focus back to the field. `lg` is a dialog's search, `md`
  a popover's.
- **`CommandList`**, the list: the listbox, named by the consumer (bits-ui's
  own default name is a placeholder), and inside it the viewport bits-ui reads
  the highlighted option from — so the field's `aria-activedescendant`
  follows the arrow keys and a screen reader hears each row. It sets no
  height: what scrolls is the host's decision (a picker scrolls a box around
  the list, under its fixed search field).
- **`CommandItem`**, a row (`role=option`). A disabled row is skipped by the
  arrow keys and cannot be picked; it reads in the muted colour rather than
  faded, because its row says why it is disabled and that reason stays at full
  contrast.

The `Command` publishes its list's id to its parts (`command.ts`): the field's
`aria-controls` names the listbox once a `CommandList` is mounted, and no
consumer passes ids. Keyboard handling is bits-ui's, on the root: ↑/↓ move the
highlight, Home/End jump, Enter picks the highlighted row (and never submits a
surrounding form — a form inside a picker is rendered outside its `Command`).
bits-ui brings the highlighted row into view by scrolling every scrollable
ancestor, the document included. In a layer that is what it should do; a list
that is part of the page — the node picker inline in a form, which no one
opened — passes `disableInitialScroll`, so its first rows arriving never move
the page away from where the reader is (a link to a field further down the
form lands under the app bar, not behind it).
`shouldFilter` is off wherever the results come from a server — and wherever
the consumer filters a list of its own by more than an item's value (a style's
name and class, a token's name and what it is for): Bits UI's own filter reads
only the value, and would hide a row that matches on the rest. `CommandInput`
is the bare, frameless field; the search overlay's head is the one place that
draws it, being a frame of its own (the glyph, the field and the close button
across the overlay); every other template uses `CommandSearch`. Picking a node — a page, a document, a
collection — is the search feature's `NodePicker`, which composes these parts.

It's also the reason *bits-ui's own* `Combobox` primitive isn't used here:
that `Combobox` is architecturally `Select` + a text input, anchor-positioned
to a trigger's measured box — the wrong shape for a full-viewport command
palette, the same class of mismatch `DropdownMenu` had for the phone's
account-menu sheet ([What is not a primitive](#what-is-not-a-primitive)).

### NavigationMenu

`NavigationMenu` (`src/lib/design-system/NavigationMenu.svelte`) is
desktop-only, for the reason a sheet is a Dialog ([What is not a primitive](#what-is-not-a-primitive)): its
`Content`/`Viewport` are Floating-UI-positioned and portal to
`document.body`, the wrong shape for a full-width phone sheet. It opens a
group's submenu on hover-intent (Bits UI's own `delayDuration`), not on a
bare click — the click handler alone doesn't toggle it, matching upstream
Radix-style navigation menus. Its only consumer is `AppBar.svelte`'s desktop
nav; the equivalent phone UI is `PhoneNavSheet.svelte`
(`src/lib/shell/appbar/`), built on `BottomSheet` with its own local
expand/collapse state per group, not this primitive. The component takes a
domain-agnostic `items` shape declared in its own file (not an import of
the site feature's `types.ts`) — `AppBar.svelte` adapts the resolved nav
tree onto it, keeping this layer free of server-type coupling like every
other primitive here.

## What is not a primitive

- **A sheet.** Bits UI has no Sheet primitive, and a bottom sheet is a styled
  variant of `Dialog`, never of `DropdownMenu`: `Dialog` is anchored to no
  trigger, so a full-width, fixed-position sheet is a plain style change,
  while `DropdownMenu.Content` is sized and placed from its trigger's
  measured box, which a full-width sheet would fight. `BottomSheet` is that
  Dialog variant. The account menu renders a `DropdownMenu` on a desktop and
  a `BottomSheet` on a phone rather than forcing one component into both
  roles; the phone editor's sheets and the settings' collapsed sidebar
  (`src/lib/shell/settings/SettingsShell.svelte`) use it too.
- **A file input.** A file field is a native `<input type="file">`, styled
  with `--ds-*` tokens where it shows (a document's upload, the branding
  images, a font, the profile picture) and hidden behind a button where a
  control opens it (the editor's image pickers): `Input`'s `bind:value`
  cannot work for a file, whose DOM `value` the browser keeps read-only.
- **A pressed Button variant.** `Button`'s `active` prop is the pressed look,
  independent of `variant`, for a trigger whose panel is open or a toggle
  that is on (with `aria-pressed` or `aria-expanded`). Pressed *groups* are
  `SegmentedControl` or `ToolbarGroup`, not a row of active Buttons.
