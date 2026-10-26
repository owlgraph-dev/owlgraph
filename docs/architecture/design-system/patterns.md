# Patterns

How primitives are put together where the parts alone do not say it: a
toolbar with overlay triggers, where an error goes, the settings pages, and
panels beside a live text editor. The overview is
[Design system](overview.md).

## Composing Toolbar with overlay triggers

`Toolbar`/`ToolbarButton`/`ToolbarGroup`/`ToolbarGroupItem` wrap Bits UI's
`Toolbar` family the same `child`-snippet way as every other primitive.
Unlike `Popover`/`DropdownMenu`'s trigger (`all: unset`, fully caller-styled),
`ToolbarButton`/`ToolbarGroupItem` own a complete default look of their own
(`.ds-toolbar-button` + `-ghost`/`-primary`/`-ghost-danger`/`-active`
modifier classes driven by `variant`/`active` props) — explicit properties,
no `all: unset`, `--ds-*` tokens throughout, matching `Button.svelte` and
`DropdownMenuItem.svelte`'s precedent of a primitive owning its own
presentation. A look supplied by the caller's class over an `all: unset` base
would depend on Vite's per-component CSS injection order, which
`:global()`/specificity doesn't control: an `all: unset` landing *after* the
caller's rule in the compiled cascade wipes out its padding, border and
background. A primitive with fully explicit properties can't
be clobbered that way, and doesn't depend on the caller supplying anything to
look correct standalone. `ToolbarButton.svelte`/`ToolbarGroupItem.svelte`
duplicate this style block between the two files rather than sharing it via a
`:global()` rule in `Toolbar.svelte` — per [don't borrow a primitive's
internal class name](primitives.md#styling-bits-ui-wrapper-primitives), small intentional duplication between
sibling files beats an invisible cross-primitive dependency. A caller can
still pass `class` for a genuine one-off addition; it is additive, never
required for baseline appearance.

**Composing a Popover/DropdownMenu trigger into the roving-tabindex set**:
`Popover`/`DropdownMenu` already own their trigger element's rendering
internally, so a second primitive (`Toolbar.Button`) can't also render that
same element. Instead, both primitives expose `triggerProps` — merged
(`mergeProps`, last) onto their own trigger button — so a raw
`BitsToolbar.Button` (imported directly from `bits-ui`, not the `ToolbarButton`
wrapper, since that wrapper renders its own literal `<button>`, which would be
a second, wrong DOM node here) can hand its computed roving-tabindex props
through:

```svelte
<BitsToolbar.Button>
  {#snippet child({ props: toolbarProps })}
    <DropdownMenu ... triggerProps={toolbarProps}>
      {#snippet trigger()}...{/snippet}
    </DropdownMenu>
  {/snippet}
</BitsToolbar.Button>
```

**The trigger's face is `TriggerFace`.** The overlay's trigger button stays
unstyled — it carries Bits UI's props, the roving-tabindex props and the focus
ring — and the snippet inside it renders `TriggerFace`, which draws the look
and reads its state from that button: `data-state="open"` paints it active,
the button's hover and press step it through the interaction tokens, a
disabled button drops both. That split keeps the one-literal-element rule of
the `child` snippet and still gives every trigger the same look.
`variant="toolbar"` is ToolbarButton's ghost item at `--ds-toolbar-h-md`
(`size="sm"` the dense 24px family: the breadcrumb's overflow, a row's
trailing action; `split` the narrow chevron beside a toolbar item);
`ghost` and `secondary` are Button's looks at `--ds-control-h-sm/md`. `icon`
makes it square; `active` adds the active look for a state the overlay
doesn't know (the heading menu while the caret is in a heading, the spacing
row while a side is overridden). The name and title belong on the button, so
they go through `triggerProps` alongside the roving props:

```svelte
<DropdownMenu triggerProps={{ ...toolbarProps, title: label, 'aria-label': label }}>
  {#snippet trigger()}<TriggerFace variant="toolbar"><Icon name="heading" /><Icon name="chevron" size={14} /></TriggerFace>{/snippet}
</DropdownMenu>
```

A trigger whose face is itself a control's preview — ColorPickerField's
swatch, IconPickerField's glyph, the account menu's avatar — keeps its own
face; TriggerFace is for triggers that look like buttons.

`Toolbar.Button` contributes no `onclick` of its own, so the Popover/
DropdownMenu's own trigger click handling remains the only one on the
composed element — nothing races an `onOpenChange`-driven side effect (e.g. a
link picker capturing the current selection before it opens).

**`ToolbarGroup`'s `value` is one-way, never `bind:`ed** — it reflects the
caller's real state (e.g. Tiptap's `active.bold`) rather than becoming the
source of truth for it. Two Bits UI behaviors make this the only safe
choice: re-clicking the active item in a `type="single"` group resets Bits'
internal value to `""` (not back to the clicked item), so a bound value would
briefly go invalid; and `ToolbarGroupItem`'s own Enter/Space handling calls
`preventDefault()` and mutates its internal value directly rather than
synthesizing a click, so a plain merged `onclick` never fires on keyboard
activation. `ToolbarGroupItem` therefore takes its own `onclick` prop as the
single place the real command runs (invoked on both pointer and keyboard
activation via a small `onkeydown` interceptor that pre-empts Bits' own
handling), and a `type="single"` group's `onValueChange` should guard against
the empty-string reset (`if (v) editTier.set(v)`) if it's wired at all.
Plain `ToolbarButton` has none of this — its Bits UI state has no special
Enter/Space casing, so native activation reaches a merged `onclick`
unimpeded.

The click path takes the same guard, for the same reason: `restProps`'
`onclick` (ours) and Bits' own `onclick` both run on a real mouse click
(`composeHandlers` runs handlers in order until one calls
`preventDefault()`), and Bits' own `onclick` also calls `toggleItem()` —
mutating its internal, never-bound-back `value` a second time and racing the
external store's one-way reflection through props, so the `active`/`pressed`
class would lag one click behind the real state. `ToolbarGroupItem`'s own
`onclick` passed to `BitsToolbar.GroupItem` therefore calls
`e.preventDefault()` after invoking the caller's `onclick`, mirroring the
`onkeydown` interceptor.

## Where an error goes

An error sits next to what caused it.

| The error is about | Shown as | Where |
|---|---|---|
| one value the user can fix in place | `FieldError` (via `FormField` / `FieldRow` `error`) | under that control, until fixed |
| one allowed value with a consequence (a colour that won't read on its ground) | `FieldWarning` (via `FieldRow` `warning`) | under that control, while the value stands |
| an action on a form or a surface (a submit failed, a lasting state such as a lost lock) | `Alert` | above the dialog footer, under the page head, or as a banner topping the surface |
| the outcome of an action with nothing on screen to attach to (a save that failed after the user moved on, an upload started by a paste or drop, a clipboard copy) | toast | the app-wide stack, bottom-right (bottom-centre on a phone) |

A validation message is never an Alert, and a failed submit is never pinned to
one field unless the server named that field. A toast is never a validation
message, a server error that returns to its form, or anything the user must act
on to avoid losing work (a lost lock stays a banner).

## Settings pages

Every settings page lives under `/settings` ([settings.md](../settings.md)):
the semantic-schema catalogues (properties, property groups, relationship
types, classes; see [semantic-layer.md](../semantic-layer.md)), the site
settings, user and namespace management, and the personal profile and API
tokens. A page there is composed from the [primitives](primitives.md) rather than
hand-rolled per route, in one of two shapes: a **settings page** (rows of
label + description beside a control — `SettingsGroup`/`SettingsRow`/
`SettingsWell`, described in [settings.md](../settings.md); branding is the
reference) or a **list page**:

- **Shell**: the settings layout — sidebar tree beside the content pane —
  is the only navigation; global navigation is the app bar's job (the
  account menu links to `/settings`). Pages carry no "back" links or inline
  "manage … →" cross-links of their own.
- **Page**: a head with the section's title as the page's `h1`, one intro
  line, the single **Add** action, and the action-result error banner
  (`src/lib/shell/SettingsPageHead.svelte`); then the list in
  `Table` (`TableRow`/`TableCell`, an `actions` cell holding the row's
  actions: Edit and Delete are icon buttons — `Button icon size="sm"`,
  `ghost` with the pencil and `ghost-danger` with the trash icon, `title` and
  `aria-label` carrying the same i18n string a text button would show — so
  a row's standard actions cost two squares, not a sentence per language; a
  catalog-specific action such as the relationship types' "manage
  properties" keeps a text label, placed before the icons. Delete sits in
  the inline `?/delete` form); the empty state is an `EmptyState` naming what to do next. Columns are chosen to fit the settings column at readable widths;
  what doesn't fit (a long description) lives in the modal and as a `title`
  tooltip on a cell, not in a wrapping cell.
- **Add/edit in a modal**, never an always-visible form under the list: a
  `Dialog` around a real `<form method="POST" use:enhance>` posting to the
  page's own action, Cancel/Save in the footer snippet submitting via the
  `form` attribute, mounted fresh per open with one-time `untrack` snapshots
  (`TreeEntryModal.svelte` in the site feature, `PropertyDefinitionModal.svelte`
  in the semantic feature — each a route adapter under its feature's `routes/`). A `fail()` from the action keeps the modal
  open and shows the error inside it. A picker that lists many options (the
  page search in the class modal) opens on demand behind a button and caps
  its list height, rather than sitting permanently open — a modal must fit
  an ordinary viewport.
- Settings routes render full-bleed inside the settings shell's own wide
  pane (`main.settings-route`, `src/routes/+layout.svelte`), so a table
  rarely needs to scroll on a desktop viewport.

All four schema catalogues are list pages (`/settings/schema/properties` is the
simplest reference; `/settings/schema/classes` shows tree rows, locked core
rows and a picker-heavy modal; `/settings/schema/relationships` a second
per-row action with its own dialog), and so are `/settings/users`,
`/settings/namespaces` and `/settings/api-tokens` — edit is a modal per row, a
namespace's members are a modal of their own, deletion is a
`variant="danger"` Dialog confirm rather than a browser `confirm()`. The
settings pages (branding, footer, home, profile) are on the row pattern —
branding's paragraph styles are a `Table` inside a wide row, with this
list grammar's row controls and modal; navigation and fonts keep their
section-shaped content (a tree editor, a card per font family) under the
same head. A modal that edits several
server-side aspects of one row (a user's role *and* password, a namespace's
name, prefix *and* access level) posts one `update` action; it is one form,
so it gets one action, instead of fanning out to the per-field actions an
inline cell control needed.

## Composing panels next to a live text editor

A `Popover`/`DropdownMenu`/`Dialog` mounted alongside a ProseMirror-backed
editor (`DesktopEditor.svelte`) has two focus-management concerns beyond a plain
page — relevant to any future editor chrome (toolbar, block settings panel, in-canvas
UI), not just the panels already migrated:

- **Escape can double-fire.** Bits UI's `EscapeLayer` calls
  `preventDefault()` on the keydown but never `stopPropagation()`, so the
  same Escape that closes a Bits UI panel still bubbles to any
  `window`-level keydown handler the editor itself owns (e.g. an
  ancestor-selection shortcut). Guard the editor's own handler with an "is
  any editor overlay open" check — `EditorOverlays.any`
  (`editor/desktop/overlays.svelte.ts`), OR'd from every panel's own open state — rather
  than relying on incidental focus state.
- **Close-auto-focus can race an explicit refocus.** If a panel's own action
  handler calls `editor.chain().focus()` and then closes itself in the same
  synchronous tick (an "apply-and-close" action — set a heading, insert a
  block, apply a picked value), Bits UI's close-auto-focus would otherwise
  refocus whatever had focus when the panel *opened* (typically the trigger
  button), silently undoing that explicit refocus. Fix via the
  `onCloseAutoFocus` escape hatch ([Primitive API convention](primitives.md#primitive-api-convention)); `editor/desktop/keyboard.ts`'s
  `preserveEditorFocusOnClose` checks whether focus is already back inside
  `.ProseMirror` by the time the callback fires (true only on the
  apply-and-close path, since Escape/outside-click never call
  `editor.chain().focus()`) and suppresses Bits UI's refocus only then — a
  single shared helper, not a per-panel state flag, and reusable as-is by
  any future panel with the same apply-and-close shape.
