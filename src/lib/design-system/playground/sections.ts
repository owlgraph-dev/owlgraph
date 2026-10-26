// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One entry per primitive family, in the order of docs/architecture/design-system/overview.md's
// catalogue table.
import type { Component } from 'svelte';
import Tokens from './sections/Tokens.svelte';
import ButtonSpecimens from './sections/ButtonSpecimens.svelte';
import InputSpecimens from './sections/InputSpecimens.svelte';
import SearchFieldSpecimens from './sections/SearchFieldSpecimens.svelte';
import CodeAreaSpecimens from './sections/CodeAreaSpecimens.svelte';
import NumberFieldSpecimens from './sections/NumberFieldSpecimens.svelte';
import FormFieldSpecimens from './sections/FormFieldSpecimens.svelte';
import LocalizedTextSpecimens from './sections/LocalizedTextSpecimens.svelte';
import SelectSpecimens from './sections/SelectSpecimens.svelte';
import ComboboxSpecimens from './sections/ComboboxSpecimens.svelte';
import ChipInputSpecimens from './sections/ChipInputSpecimens.svelte';
import SwitchSpecimens from './sections/SwitchSpecimens.svelte';
import CheckboxSpecimens from './sections/CheckboxSpecimens.svelte';
import RadioGroupSpecimens from './sections/RadioGroupSpecimens.svelte';
import TriggerFaceSpecimens from './sections/TriggerFaceSpecimens.svelte';
import SliderSpecimens from './sections/SliderSpecimens.svelte';
import SegmentedControlSpecimens from './sections/SegmentedControlSpecimens.svelte';
import PositionGridSpecimens from './sections/PositionGridSpecimens.svelte';
import ColorSpecimens from './sections/ColorSpecimens.svelte';
import ScaleSpecimens from './sections/ScaleSpecimens.svelte';
import IconPickerSpecimens from './sections/IconPickerSpecimens.svelte';
import FieldRowSpecimens from './sections/FieldRowSpecimens.svelte';
import CollapsibleGroupSpecimens from './sections/CollapsibleGroupSpecimens.svelte';
import SettingsSpecimens from './sections/SettingsSpecimens.svelte';
import TableSpecimens from './sections/TableSpecimens.svelte';
import PaginationSpecimens from './sections/PaginationSpecimens.svelte';
import AlertSpecimens from './sections/AlertSpecimens.svelte';
import EmptyStateSpecimens from './sections/EmptyStateSpecimens.svelte';
import ToastSpecimens from './sections/ToastSpecimens.svelte';
import SpinnerSpecimens from './sections/SpinnerSpecimens.svelte';
import BadgeSpecimens from './sections/BadgeSpecimens.svelte';
import CardSpecimens from './sections/CardSpecimens.svelte';
import AvatarSpecimens from './sections/AvatarSpecimens.svelte';
import IconSpecimens from './sections/IconSpecimens.svelte';
import TabsSpecimens from './sections/TabsSpecimens.svelte';
import SortableListSpecimens from './sections/SortableListSpecimens.svelte';
import AccordionSpecimens from './sections/AccordionSpecimens.svelte';
import ConditionGroupSpecimens from './sections/ConditionGroupSpecimens.svelte';
import TooltipSpecimens from './sections/TooltipSpecimens.svelte';
import PopoverSpecimens from './sections/PopoverSpecimens.svelte';
import DropdownMenuSpecimens from './sections/DropdownMenuSpecimens.svelte';
import DialogSpecimens from './sections/DialogSpecimens.svelte';
import CommandSpecimens from './sections/CommandSpecimens.svelte';
import CommandSearchSpecimens from './sections/CommandSearchSpecimens.svelte';
import ToolbarSpecimens from './sections/ToolbarSpecimens.svelte';
import NavigationMenuSpecimens from './sections/NavigationMenuSpecimens.svelte';

export type PlaygroundSection = {
  /** URL id (`?section=<id>`) and the `data-playground` value. */
  id: string;
  title: string;
  /** When to reach for it, in one to three sentences; the rationale stays in the docs. */
  note: string;
  /** Where the rationale is: a docs page and its heading, which check-paths holds to the page. */
  docs: string;
  component: Component;
};

export const SECTIONS: PlaygroundSection[] = [
  {
    id: 'tokens',
    title: 'Tokens',
    note: 'The --ds-* vocabulary every primitive is built from: colors, the focus ring, spacing, radius, shadow, weight and the text ladder. Component styles use these and nothing else — no hex, rgb or px literals.',
    docs: 'docs/architecture/design-system/tokens.md#tokens',
    component: Tokens,
  },
  {
    id: 'button',
    title: 'Button',
    note: 'Any clickable action. Variants say what the action means (primary once per view, ghost for quiet actions, danger for the one-off confirm, ghost-danger for repeated per-row deletes); size follows the surrounding controls. Icon-only buttons need a title and an aria-label.',
    docs: 'docs/architecture/design-system/primitives.md#primitive-api-convention',
    component: ButtonSpecimens,
  },
  {
    id: 'input',
    title: 'Input and Textarea',
    note: 'Free text. Input is always full width of its container (a form row or grid cell); Textarea for multi-line text. For a short number beside a label use NumberField instead.',
    docs: 'docs/architecture/design-system/overview.md#catalogue',
    component: InputSpecimens,
  },
  {
    id: 'search-field',
    title: 'SearchField',
    note: 'A search term with its submit inside the field: the input submits on Enter, the icon on a tap, and the field takes the whole row. For a page search form; not for filtering a list in place (Input) or a command menu (Command).',
    docs: 'docs/architecture/design-system/primitives.md#searchfield',
    component: SearchFieldSpecimens,
  },
  {
    id: 'code-area',
    title: 'CodeArea',
    note: 'Source someone writes by hand — a stylesheet, a snippet. Highlighting comes from a highlight callback the consumer passes; the ground is dark in both schemes because the syntax palette is one fixed dark set. Tab moves focus rather than typing an indent, so the field is never a keyboard trap. Prose is a Textarea.',
    docs: 'docs/architecture/design-system/primitives.md#codearea',
    component: CodeAreaSpecimens,
  },
  {
    id: 'form-field',
    title: 'FormField',
    note: 'One field of a form a user fills in and submits (a dialog\'s add/edit form): label above, control, hint, the field\'s own error. Design-system controls inside wire their id, aria-describedby and invalid state themselves; a raw element takes them from the snippet argument; group labels several controls. Optional fields carry optionalLabel; the form\'s action error is an Alert.',
    docs: 'docs/architecture/design-system/primitives.md#formfield',
    component: FormFieldSpecimens,
  },
  {
    id: 'localized-text-field',
    title: 'LocalizedTextField',
    note: 'One text in several languages on one line: a language select and the input for the chosen language. Each option shows its state (required, missing, done) and a badge counts the translated languages while one is missing; every language still posts its own input. Multiline for a description; text in a language not offered is kept.',
    docs: 'docs/architecture/design-system/primitives.md#localizedtextfield',
    component: LocalizedTextSpecimens,
  },
  {
    id: 'number-field',
    title: 'NumberField',
    note: 'A short numeric box with its unit drawn inside the frame, for a number beside a label in a narrow panel. null means unset and shows the placeholder (the resolved value). Not built on Input on purpose.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: NumberFieldSpecimens,
  },
  {
    id: 'select',
    title: 'Select and MultiSelect',
    note: 'One value (or several) from a closed list. Items flat or grouped; width="full" for a form row or grid cell; size="sm" in the block settings panel. A value that may be typed freely is a Combobox, a small set of two to four options a SegmentedControl.',
    docs: 'docs/architecture/design-system/primitives.md#select-and-multiselect',
    component: SelectSpecimens,
  },
  {
    id: 'combobox',
    title: 'Combobox',
    note: 'A text entry with suggestions where free text is a valid value (a new tag, a font size). Hand-rolled, not bits-ui\'s, because that one can only commit list items.',
    docs: 'docs/architecture/design-system/primitives.md#combobox',
    component: ComboboxSpecimens,
  },
  {
    id: 'chip-input',
    title: 'ChipInput',
    note: 'Several free-text values: chosen ones as chips, a Combobox entry for the next. Enter or a picked suggestion adds; Backspace in an empty entry removes the last chip. A non-removable label is a Badge, not a chip.',
    docs: 'docs/architecture/design-system/primitives.md#chipinput',
    component: ChipInputSpecimens,
  },
  {
    id: 'switch',
    title: 'Switch',
    note: 'An on/off setting that applies immediately. Pass ariaLabel when the visible label belongs to the row rather than the switch.',
    docs: 'docs/architecture/design-system/overview.md#catalogue',
    component: SwitchSpecimens,
  },
  {
    id: 'checkbox',
    title: 'Checkbox',
    note: 'One on/off choice submitted or saved with others (a member of a list, a block to keep); a setting that applies at once is a Switch. The label is the children, so the whole row is the target. name + value post like a native checkbox; indeterminate marks a partly-checked parent.',
    docs: 'docs/architecture/design-system/primitives.md#checkbox-and-radiogroup',
    component: CheckboxSpecimens,
  },
  {
    id: 'radio-group',
    title: 'RadioGroup',
    note: 'One value from a short list of labelled radios, in a form where other fields depend on it (where a link points). Arrow keys move between options. Inside a FormField group the field label names it. Two to four inline options applied at once are a SegmentedControl; a longer list is a Select.',
    docs: 'docs/architecture/design-system/primitives.md#checkbox-and-radiogroup',
    component: RadioGroupSpecimens,
  },
  {
    id: 'slider',
    title: 'Slider',
    note: 'A continuous number in a bounded range. A value with a small closed set of options is a SegmentedControl or Select, not a slider.',
    docs: 'docs/architecture/design-system/primitives.md#slider',
    component: SliderSpecimens,
  },
  {
    id: 'segmented-control',
    title: 'SegmentedControl',
    note: 'Two to four mutually exclusive options that should all stay visible (type="single"), or a set of toggles (type="multiple"). size="sm" and stretch for block settings rows; five or more options are a Select.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: SegmentedControlSpecimens,
  },
  {
    id: 'position-grid',
    title: 'PositionGrid',
    note: 'The part of a picture that stays in view when it is cropped: an image’s focal point, a background image’s focus. Nine anchor points in a 3×3 grid; arrow keys move between them.',
    docs: 'docs/architecture/design-system/primitives.md#positiongrid',
    component: PositionGridSpecimens,
  },
  {
    id: 'color',
    title: 'ColorField and ColorPickerField',
    note: 'ColorField is the swatch group itself, for a panel with room; ColorPickerField is its compact trigger opening the same group in a Popover, for a FieldRow. Pass the resolved color so an unset value still previews what renders.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: ColorSpecimens,
  },
  {
    id: 'scale',
    title: 'ScaleField',
    note: 'A value from a named scale, with a custom number as the escape hatch (a font size: type-scale steps, then px). Each step is drawn at a bounded preview size that grows with the scale, its real value muted. The unset or clear control and any resolved hint stay in the caller.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: ScaleSpecimens,
  },
  {
    id: 'icon-picker',
    title: 'IconPickerField',
    note: 'The compact form of an icon setting: the current glyph as a trigger, the curated quick-link icon grid in a Popover.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: IconPickerSpecimens,
  },
  {
    id: 'field-row',
    title: 'FieldRow and InfoTip',
    note: 'One setting in a narrow panel (the block settings panel): label line plus control. layout="inline" for controls up to about 120px wide, "stack" for anything wider. hint is the muted resolved default, info is help behind an ⓘ. In a wide settings pane use SettingsRow instead.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: FieldRowSpecimens,
  },
  {
    id: 'collapsible-group',
    title: 'CollapsibleGroup',
    note: 'One flush, titled, independently collapsible group in a column of them (the sections of the block settings panel). Sentence-case title, optional modified dot. A framed group whose open state lives on the group is an Accordion.',
    docs: 'docs/architecture/design-system/primitives.md#the-narrow-panel-controls',
    component: CollapsibleGroupSpecimens,
  },
  {
    id: 'settings',
    title: 'SettingsGroup, SettingsRow and SettingsWell',
    note: 'The settings-page grammar: titled groups of label-and-description-beside-control rows, plus the one inset well for an asset preview. Rows stack on a narrow container, not viewport. Everything else on a settings page is rows — not cards.',
    docs: 'docs/architecture/design-system/patterns.md#settings-pages',
    component: SettingsSpecimens,
  },
  {
    id: 'table',
    title: 'Table',
    note: 'The list primitive for every list on a settings page. Columns are declared, never measured; rows share one height; long values truncate with a title. Row actions are icon buttons in an actions cell. Responsive means horizontal scroll inside the wrapper, not card reflow.',
    docs: 'docs/architecture/design-system/primitives.md#table',
    component: TableSpecimens,
  },
  {
    id: 'pagination',
    title: 'Pagination',
    note: 'Steps through a long result list a page at a time. Every page is a link the consumer builds, so a page can be bookmarked and Back returns to it; narrow containers get the short row.',
    docs: 'docs/architecture/design-system/primitives.md#pagination',
    component: PaginationSpecimens,
  },
  {
    id: 'alert',
    title: 'Alert',
    note: 'A message about what the user is doing: an action failed (danger), a caveat applies (warning), a note (info), it worked (success). Inline in a form, dialog or page; layout="banner" tops a whole surface. Render it conditionally so it is announced. An error about one field is that field\'s own text, not an Alert.',
    docs: 'docs/architecture/design-system/primitives.md#alert',
    component: AlertSpecimens,
  },
  {
    id: 'empty-state',
    title: 'EmptyState',
    note: 'What a list, table, panel or search shows when it has nothing: one muted line and, where there is an obvious next step, the action beside it. inline where the list would be; centered for a results area; size="sm" on dense surfaces; live when it appears as the user types.',
    docs: 'docs/architecture/design-system/primitives.md#emptystate',
    component: EmptyStateSpecimens,
  },
  {
    id: 'toast',
    title: 'Toast',
    note: 'The outcome of an action with nowhere on screen to sit: a save that failed after the user moved on, an upload started by a paste, a copy to the clipboard. toast.error(...) from client code; the root layout mounts the one Toaster. Errors stay until dismissed, other tones leave after 5s; hover or focus pauses; at most three show. A wrong value is a FieldError, a failed submit an Alert.',
    docs: 'docs/architecture/design-system/primitives.md#toast',
    component: ToastSpecimens,
  },
  {
    id: 'spinner',
    title: 'Spinner',
    note: 'Indeterminate progress in the current text colour. Decorative by default — the busy thing says so (Button loading is the usual home: the spinner replaces the label, the width stays). Pass label when the spinner is the only sign of progress. Under reduced motion it pulses instead of turning.',
    docs: 'docs/architecture/design-system/primitives.md#spinner',
    component: SpinnerSpecimens,
  },
  {
    id: 'badge',
    title: 'Badge',
    note: 'A small static label next to a name (a datatype, an origin). A removable value is a chip.',
    docs: 'docs/architecture/design-system/primitives.md#badge',
    component: BadgeSpecimens,
  },
  {
    id: 'card',
    title: 'Card',
    note: 'One item among many, side by side or stacked: a search result, a browsed page. A static surface; the link inside it is the control. Not for settings (rows), lists of rows (Table) or a preview (SettingsWell).',
    docs: 'docs/architecture/design-system/primitives.md#card',
    component: CardSpecimens,
  },
  {
    id: 'avatar',
    title: 'Avatar',
    note: 'A user image with an initials fallback.',
    docs: 'docs/architecture/design-system/overview.md#catalogue',
    component: AvatarSpecimens,
  },
  {
    id: 'icon',
    title: 'Icon',
    note: 'The chrome glyph set (Icon, stroke = currentColor, aria-hidden) and the quick-link icons an author can pick for content (icons.ts). Add a glyph to Icon.svelte before reaching for an inline SVG.',
    docs: 'docs/architecture/design-system/overview.md#catalogue',
    component: IconSpecimens,
  },
  {
    id: 'tabs',
    title: 'Tabs',
    note: 'An in-page panel swap only. Route-level sections belong in the settings sidebar, never in tabs.',
    docs: 'docs/architecture/design-system/primitives.md#tabs',
    component: TabsSpecimens,
  },
  {
    id: 'sortable-list',
    title: 'SortableList',
    note: 'An order its user rearranges: an item moves by dragging its handle, or with ↑ / ↓ on the focused handle, each keyboard move announced. The consumer reorders its items on onMove; a fixed list is a plain list.',
    docs: 'docs/architecture/design-system/primitives.md#sortablelist',
    component: SortableListSpecimens,
  },
  {
    id: 'accordion',
    title: 'Accordion',
    note: 'A framed group of titled sections that open independently, inside a dialog or builder. size="sm" for a secondary, collapsed-by-default section among a form\'s own fields.',
    docs: 'docs/architecture/design-system/primitives.md#accordion',
    component: AccordionSpecimens,
  },
  {
    id: 'condition-group',
    title: 'ConditionGroup',
    note: 'The group block of a filter or rule builder: combinator header, members, optional label, nesting by depth. Domain-free — the consumer renders its rows.',
    docs: 'docs/architecture/design-system/primitives.md#conditiongroup',
    component: ConditionGroupSpecimens,
  },
  {
    id: 'tooltip',
    title: 'Tooltip',
    note: 'Short help on hover or focus. With a trigger snippet it is a real focusable trigger (InfoTip is that shape); fully controlled with customAnchor when there is no DOM trigger. Never the only way to reach information.',
    docs: 'docs/architecture/design-system/primitives.md#tooltip',
    component: TooltipSpecimens,
  },
  {
    id: 'popover',
    title: 'Popover',
    note: 'A small anchored panel with controls (a picker, a palette). Next to the editor, pass onCloseAutoFocus so an apply-and-close action keeps the caret. A list of commands is a DropdownMenu; a form is a Dialog.',
    docs: 'docs/architecture/design-system/patterns.md#composing-panels-next-to-a-live-text-editor',
    component: PopoverSpecimens,
  },
  {
    id: 'dropdown-menu',
    title: 'DropdownMenu',
    note: 'A list of commands behind a trigger, with items, separators, named groups and a danger item. On a phone the same content is a BottomSheet, not a forced full-width menu.',
    docs: 'docs/architecture/design-system/patterns.md#composing-panels-next-to-a-live-text-editor',
    component: DropdownMenuSpecimens,
  },
  {
    id: 'trigger-face',
    title: 'TriggerFace',
    note: 'The visible face of a Popover, DropdownMenu or Tooltip trigger, inside its trigger snippet: toolbar (sm/md, icon, split), ghost or secondary (sm/md, icon). It reads open, hover, pressed and disabled from the trigger button; active adds a state the overlay does not know. Name and title go on the button via triggerProps.',
    docs: 'docs/architecture/design-system/patterns.md#composing-toolbar-with-overlay-triggers',
    component: TriggerFaceSpecimens,
  },
  {
    id: 'dialog',
    title: 'Dialog and BottomSheet',
    note: 'A modal task: a form, a confirm (variant="danger"), a picker. Bounded to the viewport, body scrolls, footer stays. Add/edit forms in settings pages are always a Dialog, never an inline form. BottomSheet is the phone shape.',
    docs: 'docs/architecture/design-system/primitives.md#primitive-api-convention',
    component: DialogSpecimens,
  },
  {
    id: 'command',
    title: 'Command',
    note: 'The cmdk-style filtered list (search field, CommandList, items), composed inside a Dialog, a Popover or a sheet — it brings no modal chrome of its own. A disabled item is skipped by the arrows and reads muted; its row says why. Picking a node is NodePicker, which composes this.',
    docs: 'docs/architecture/design-system/primitives.md#command',
    component: CommandSpecimens,
  },
  {
    id: 'command-search',
    title: 'CommandSearch',
    note: 'The search field of a Command: framed, a search glyph, a clear button once something is typed, the whole row wide by itself. Escape clears a typed term before it closes the layer around. lg in a dialog, md in a popover. Not a form field (SearchField) and not a filter for a list in place (Input).',
    docs: 'docs/architecture/design-system/primitives.md#command',
    component: CommandSearchSpecimens,
  },
  {
    id: 'toolbar',
    title: 'Toolbar',
    note: 'A roving-tabindex row of editor commands: ToolbarButton for one-shot actions, ToolbarGroup/ToolbarGroupItem for exclusive or multiple toggles. Not a generic button row — that is Buttons in a flex container.',
    docs: 'docs/architecture/design-system/patterns.md#composing-toolbar-with-overlay-triggers',
    component: ToolbarSpecimens,
  },
  {
    id: 'navigation-menu',
    title: 'NavigationMenu',
    note: 'The app bar\'s desktop navigation: links and hover-opened groups. Desktop only; the phone equivalent is a BottomSheet.',
    docs: 'docs/architecture/design-system/primitives.md#navigationmenu',
    component: NavigationMenuSpecimens,
  },
];
