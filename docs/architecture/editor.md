# Editor

The browser editor edits a node: a page's content and metadata, or a
document's or a collection's metadata. A page is edited in **two chrome shells
sharing one editing core**: `src/lib/features/editor/desktop/DesktopEditor.svelte`
(desktop) and `src/lib/features/editor/phone/PhoneEditor.svelte` (phone). Both
instantiate their own `EditorCore` (`core/editorCore.svelte.ts`) and mount the
same TipTap/ProseMirror instance, schema, and NodeViews — this is *not* a
third render path alongside the editor/public split in
[architecture/overview.md](overview.md); both shells render through the same
NodeViews, only the surrounding UI differs.

## The folders

```
src/lib/features/editor/
  index.ts          types only: the node-metadata prop contract
  components.ts     DesktopEditor, PhoneEditor, DocumentEditor, CollectionEditor
  core/             EditorCore: the document, its selection, every content write both shells share
  commands/         structural document commands that only desktop chrome issues
  session/          the page's edit session: lock, lost draft, save, what both shells set up
  meta/             a node's metadata as all three editors edit it: header, title, tags, mirrors, actions
  shared/           what both page shells draw with: the canvas, the selected box, the scheme, the link rows
  desktop/          the desktop page shell and its chrome
    toolbar/        the desktop toolbar and its pickers
  blockSettings/    the desktop block settings panel: its target, sections, breadcrumb and switcher
  phone/            the phone page shell and its chrome
  document/         the document editor
  collection/       the collection editor
  blocks/           each block's settings panel and the editor's block catalogue
  capabilities/     each capability's edit fields
  routes/           the load, the edit route and its lock gate
  e2e/              the editor's specs
```

Read it in this order: `routes/EditPage.svelte` (what happens when someone
opens `/…/edit`), then `session/` (the lock and the save), then
`desktop/DesktopEditor.svelte` or `phone/PhoneEditor.svelte` (a shell composed
of named parts), then `core/editorCore.svelte.ts` (the document).

## The edit route

`src/routes/[[namespace=namespace]]/[slug]/edit/+page.svelte` is a one-line
adapter around `editor/routes/EditPage.svelte`, which takes the load's data
(`routes/edit.server.ts`, typed from the load itself) and owns what only a
route can: the route's lifecycle (`onMount`, `onDestroy`, `beforeNavigate`,
`pagehide`), navigation, reloads, and the choice of shell. It mounts the
editor the node's kind needs — the document or the collection editor, or for
a page the lock gate (`routes/LockGate.svelte`: opening, blocked, open in
another tab, moved on) until the lock is held, then a page shell. The shell is
chosen by the phone shell's own query (`PHONE_SHELL_MEDIA`, a `MediaQuery`),
and both shells take the same props, built once. A lost lock's draft is
reconciled in the pages feature's `ReconcilePanel` beside it.

## The edit session

`session/` holds the page's edit session as classes that take what they act
on as arguments — the page client's calls, the other-tabs channel, storage,
`reload`, `goto`, `confirm` — so they run under Vitest without SvelteKit; the
route passes them in.

- **The lock** (`session/editLock.svelte.ts`, `EditLock`): who holds the page,
  as a phase — acquiring, editing, blocked, open elsewhere, lost, moved on.
  It acquires, renews with a heartbeat every 20 s, polls a blocked lock every
  15 s (the phase changes start and stop it), takes over for an admin after a
  confirmation, steps aside for the reader's other tab, and releases on
  leaving — but not on the editor's own navigations, such as a slug change,
  which keep the lock. Every save carries its token, and a save refused for a
  lost lock makes the phase *lost*. What the lock is and who may take it over
  is [authorization.md](authorization.md#edit-lock)'s.
- **The lost draft** (`session/lostDraft.svelte.ts`, `LostDraft`): when the lock
  goes with unsaved work, the editor's document is stored as a draft version
  and compared with the page as the editor would hold it; applying picks
  re-acquires the lock, discarding leaves for the read view. With nothing
  unsaved, the page just says that editing moved on.
- **The Save button** (`session/saveAction.svelte.ts`, `SaveAction`): whether a
  save runs, when the last one landed, and the toast a failed one leaves, kept
  until dismissed, whose *Try again* saves what the editor holds then. A save
  names the unknown blocks the author deleted since the editor loaded the page
  ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)); a save refused for dropping others
  leaves a toast without a retry, and a lost lock is left to the lock-lost
  banner. The editor saves only on demand: there is no
  autosave in the browser.
- **What both shells set up** (`session/pageEditing.svelte.ts`):
  `createPageEditing()` makes the core, the page's metadata mirror and the
  Save button's behaviour, and mounts the editor when the shell mounts;
  `reportLockLost()` registers the effect that makes a lost lock's editor
  read-only and hands its document up once.

## The shared core

`core/editorCore.svelte.ts` exports `createEditorCore()`, returning an
`EditorCore` that owns the TipTap instance (`mount()`, `destroy()`) and the
document: what is unsaved (`isDirty()`, `markSaved()`), the document as it is
to be stored (`docJSON()`) and a stored one as this editor would hold it
(`heldJSON()`), the writes to the selected block's or the page's attributes,
and image uploads. It is composed of parts:

- **The selection** (`core/selection.svelte.ts`, `SelectionState`): the
  ancestor chain at the selection (`resolveSelectionChain()` in
  `src/lib/features/content/blocks/shared/blockOps.ts`), the entry selected in
  it and the pin that select-parent sets, the block selected, the cell,
  container, list and table cell around the caret (each its type, attributes
  and position), the typography target, and the guards the block tools ask
  (whether a grid, a flex row or a table can lose a column, a row, a cell).
  `selected` is a new object after every transaction, so what reads the
  document beside it recomputes.
- **The formatting** (`core/format.svelte.ts`, `FormatState`): what the
  formatting controls show and write — the active marks and nodes, the
  typography fields with the arbitration between a block's own values and
  marks on its text, the named style and the paragraph style, and whether a
  colour reads on its background.
- **Links** (`core/links.svelte.ts`, `LinkInsertion`): the range the link
  picker opened over, the quick-link card it retargets, and what a pick
  writes — an inline link, a card at the caret, a card's new target. Whether
  the picker is open is the chrome's.
- **Property marks** (`core/properties.svelte.ts`, `PropertyMarks`): a
  property's value or a query template's parameter on the selected text, and
  the page's properties read off its content.
- **Reading a stored document** (`core/load.ts`): the kinds under their names
  now, the stand-ins for unknown blocks, strays put in sections, placeholders
  refilled; and the pre-flight read that opens no editor on a page Tiptap
  would open empty ([blocks/anatomy.md](blocks/anatomy.md#unknown-blocks)).

The core refreshes its parts after every transaction (`refresh()`). A refresh
can run inside an effect — a lost lock's `setEditable` fires Tiptap's
`update` — so it writes the parts' state and never reads it back: the
selection hands the typography target to the formatting state as an argument.
A class that registers effects (`SelectedBox`, `CanvasScheme`, and
`reportLockLost`'s effect) is made while a shell initialises, at the same
place among the shell's effects.

**Every public method on `EditorCore` and its parts is an arrow-function class
field** (`selectAncestor = (i) => {...}`), not a prototype method. Chrome
receives many of them as bare callbacks (`onclick={save.run}`,
`core.onActivity = hover.onActivity`), and a plain method invoked that
way loses its `this` binding — arrow fields bind `this` lexically at
construction, so they stay correct however far from the instance they're
called. This is the one implementation detail most likely to bite a change
that adds a new method the wrong way.

**The sync rule:** anything that changes document content or attributes
goes into the core so both shells get it for free. Anything about how a shell
*surfaces or triggers* an operation — toolbar layout, popover vs. bottom
sheet, which buttons exist — is per-shell chrome, never shared. A change
under `editor/desktop/` or `editor/phone/` is chrome; a change under
`editor/core/` needs to make sense for both.

Structural construction — the Insert menu's blocks, the append strip, a
placeholder replaced in one step — is a command module of its own
(`commands/insert.ts`), and so are the writes by position the block tools
and the block settings make (`commands/attrs.ts`); only desktop chrome issues
them, so they stay out of the core.

## A node's metadata

`meta/` is what all three editors share about the node: the prop contract
(`meta/nodeMeta.ts`, which `index.ts` re-exports), the head row
(`meta/EditorHeader.svelte`: title and slug fields, tags, the properties,
access and more menus), and the mirror of the node's stored metadata
(`meta/metaMirror.svelte.ts`: tags, manual properties, visibility and shares,
each shown at once, then as stored). The node actions a route wires to the
node client — rename, tags, properties, class, language, visibility, shares,
share links, namespace move, delete — are `meta/nodeActions.ts`'s, with
navigation passed in; the delete confirmation's state is
`meta/deleteRequest.svelte.ts`'s.

## The desktop shell

`desktop/DesktopEditor.svelte` composes named parts around the canvas
(`shared/EditorCanvas.svelte`, which both shells draw):

- the head row and the toolbar (`desktop/toolbar/EditorToolbar.svelte`, built
  from a typography popover, the named-style picker, the link picker and the
  property picker);
- the block tools over the selected and the hovered block
  (`desktop/CanvasOverlay.svelte`), the hover outline (`desktop/hover.svelte.ts`)
  and a block's drag (`desktop/blockDrag.svelte.ts`);
- the block settings panel (`blockSettings/BlockSettings.svelte`, its capability
  sections in `blockSettings/CapabilitySections.svelte`), which edits the
  selection entry `blockSettings/target.ts` gives it, and on a small screen
  overlays the canvas;
- the block Edit dialogs (`desktop/BlockEditDialogs.svelte`, their state
  `desktop/blockEdit.svelte.ts`), the page's dialogs (`desktop/PageDialogs.svelte`)
  and a placeholder's insert menu (`desktop/PlaceholderInsertMenu.svelte`);
- the one file input (`desktop/imagePicker.svelte.ts`): a new image, the
  selected image's replacement, a background image.

The open flag of every layer the shell draws is one class's
(`desktop/overlays.svelte.ts`), and so is whether any is open: while one is,
Escape is that layer's, otherwise the window's Escape steps the selection up
to the parent block (`desktop/keyboard.ts`). The header and the block settings
panel's popovers report into it too
([design-system/patterns.md](design-system/patterns.md#composing-panels-next-to-a-live-text-editor)).

The first level of chrome under a shell — the toolbars, the block tools, the
block settings panel and the phone's settings sheet — takes the core and
reads it; the leaf components inside (a section, a field, a picker's list)
take values and callbacks.

## The phone shell

### Why a separate shell, not one responsive editor

> Decision: [0003. The phone gets an editor shell of its own](../adr/0003-the-phone-gets-an-editor-shell-of-its-own.md).

The desktop editor is feature-dense and mouse/keyboard-shaped: a formatting
toolbar with popovers, a floating selection overlay, drag-to-resize grid
dividers, a block settings panel. None of that survives being squeezed into a
touch viewport. The phone is scoped as **edit-existing, not construct**: a
phone user fixes text, sets typography, links, tags, attributes, access,
images and what an embedded collection or document shows — the same
content/metadata work desktop supports — but never
builds page structure (grid/flex layout, query/template authoring). That's
a desktop task, full stop, and the phone shell has no UI for it at any
nesting depth.

`phone/PhoneEditor.svelte` draws its own head row (`phone/PhoneHeader.svelte`),
a tool strip whose controls open bottom sheets (`phone/PhoneToolbar.svelte`),
the selected block's outline (`phone/PhoneCanvasOverlay.svelte`), and the
sheets for tags and block settings.

### Device detection vs. viewport simulation — two different things

The edit route decides which shell to mount by real detection of the actual
browser viewport: a `MediaQuery` on the phone shell's query,
`PHONE_SHELL_MEDIA`, so a phone held sideways gets this shell too
([responsive.md](responsive.md#two-kinds-of-breakpoint)).

`src/lib/features/content/capabilities/editTierStore.ts`'s `editTier` store is
unrelated: it's an *authoring* toggle for which breakpoint's *stored*
capability values (typography, layout, spacing, image width) are being edited
— independent of the real device. The core mirrors it (`core.editTier`).
Desktop exposes it as a manual desktop/tablet/phone switcher — the block
settings panel's persistent top row ("Values for"), with the toolbar showing
the same switcher only while the panel is collapsed — so an author can
preview/edit another breakpoint's values without leaving their desktop
browser. The phone shell has no such switcher (there's nothing to preview —
its canvas is the device's own width), so it sets `editTier` to the tier that
width renders (`canvasTier`: the phone's held upright; held sideways a
tablet's, on a large phone even a desktop's) and follows the canvas as the
device turns, so an edit always changes what the author sees. The typography
sheet names that tier ("Values for Phone"), since an upright and a sideways
phone edit different values. For the same reason its canvas has no inset of
its own: it is the device's full width, so the page's containers collapse and
wrap in it exactly as a reader on that phone sees them
([responsive.md](responsive.md#the-editor-collapses-like-the-page)).

Don't confuse the two: one answers "what shell should render," the other
answers "which breakpoint's data does this edit target."

### Structural-type suppression

`src/lib/features/content/blocks/shared/blockOps.ts` exports `STRUCTURAL_BLOCK_TYPES` — the
block types whose editing surface is construction/layout
(`grid`, `pageSection`, `gridCell`, `flexContainer`, `flexCell`, `table`,
`queryBlock`), formalizing the same set desktop's
`CanvasOverlay.svelte` already branches on by type name. It has two
independent consumers, at two different layers, deliberately not unified
into one code path since they operate on different things:

- **The phone shell's tool strip** gets a delete action only for a
  tap-selected block outside that set — a structural type gets the selected
  outline only. One stray tap deleting an entire grid with no confirmation
  and no "select parent" to back out with is a bad affordance regardless of
  whether it's technically reachable.
- **`src/lib/features/content/blocks/grid/tiptap.ts`'s `Grid` NodeView**
  consults an `interactive` extension option (not the type set directly,
  since it only needs to know about itself) to decide whether the grid gets
  its construction handles at all — the column and row dividers and the
  cell-merge selection (`GridHandles.svelte`); the table's resize
  handles and the image's resize grip follow the same option. The core's
  `mount()` threads this from `isPhone`: `Grid.configure({ interactive: !isPhone })`.
  Suppression means **not drawing the handles**, not CSS-hiding an
  otherwise-live handle — an invisible active touch target is worse than no
  target at all.

### Block settings

The phone has no block settings panel, but a block that shows a node — a
collection's entries or a document, the core's kinds and a plugin's alike
([blocks/node-embeds.md](blocks/node-embeds.md#one-family-in-the-editor)) — has its own settings
there: which node it shows and how it reads are content work, not
construction. Selecting one adds a **Block settings** tool to the toolbar,
beside Delete, which opens them in a sheet
(`phone/PhoneBlockSettingsSheet.svelte`, a `BottomSheet` of the tall size
with a close button). The sheet draws exactly what the desktop panel
draws for the kind — the core's settings panel (`editor/blocks/settings.ts`),
or a plugin's own sections in the panel's frame — with the same target
and the same actions (`editor/blocks/embedPicker.ts`), so a pick in its picker
turns the block into another kind of the family here too, and the sheet
follows the block. The picker opens as a page of the sheet, never a dialog on
it: its Back (or Escape) returns to the settings as they were. The capability
sections (spacing, surface, placement) stay the desktop's.

### The `BottomSheet` primitive

bits-ui has no native Sheet/Drawer, so `src/lib/design-system/BottomSheet.svelte`
is built directly on `BitsDialog.Content` (the same base `Dialog.svelte`
uses), anchored to the bottom edge and slid up instead of centered. It
lives in `design-system/` rather than under `editor/` since it's a general
mobile pattern — `AccountMenu.svelte`'s mobile menu uses it too, not just
the editor.

One structural detail worth knowing before touching this file: the outer
`.ds-sheet-content` (the rounded box) is `overflow: hidden`, and the actual
scrolling happens on the inner `.ds-sheet-body`. A native scrollbar isn't
clipped by its own element's `border-radius` in most browsers, so if
`overflow-y: auto` ever moves back onto the outer box, the scrollbar
reintroduces itself rendering square across the rounded corner. Keep the
outer box `overflow: hidden` and the inner body `overflow-y: auto` +
`min-height: 0` (the standard "sticky header, scrollable content" flex
fix).

A sheet shows **pages** ([design-system/overview.md](design-system/overview.md)): a part of its
content that would open a layer — a panel's node picker — shows a page in
the sheet's place, with a back button, instead of stacking a dialog on the
sheet.

## Related pages

- [architecture/overview.md](overview.md) — the editor/public render split this
  page's shared-core split is a sibling concern to (see the note at the
  top: not a third render path), and the feature layout the folders follow.
- [authorization.md](authorization.md#edit-lock) — the edit lock the session
  holds.
- [design-system/overview.md](design-system/overview.md) — the Bits UI-based component
  library `BottomSheet.svelte` and the rest of the editor's chrome are
  built from.
- [blocks/overview.md](blocks/overview.md) — the block & capability model
  `STRUCTURAL_BLOCK_TYPES` classifies, and where capabilities are edited.
