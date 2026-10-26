<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A free-text input with a filtered suggestion list. Not bits-ui's Combobox:
  // that is a filterable select, which can't commit text missing from the list.
  // The list is a bits-ui Popover anchored to the input, so it escapes scroll
  // containers and counts as inside a surrounding Dialog; the input owns focus
  // and open/close, so the layer's own trap and dismissal are off.
  import { Popover as BitsPopover } from 'bits-ui';
  import { getFormFieldContext } from './formField';

  let {
    value,
    options,
    onValueChange,
    type = 'text',
    min,
    max,
    placeholder,
    disabled = false,
    class: className = '',
    title,
    ariaLabel,
    id,
    ariaDescribedby,
    invalid = false,
    commitOnBlur = true,
    onKeydown,
    size = 'md',
  }: {
    value: string | number | null;
    options: readonly (string | number)[];
    /** Controlled only: a commit is reported, never written into `value` (ChipInput
     * keeps `value=""` so the entry clears after each chip). */
    onValueChange: (value: string | null) => void;
    type?: 'text' | 'number';
    min?: number;
    max?: number;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    title?: string;
    /** Override a surrounding FormField's id, described-by ids and error state. */
    id?: string;
    ariaDescribedby?: string;
    invalid?: boolean;
    ariaLabel?: string;
    /** Whether leaving the field commits the typed text. A host that adds an
     * item per commit (ChipInput) passes false; blur then restores the value. */
    commitOnBlur?: boolean;
    /** Runs before the own key handling; `preventDefault()` claims the key. */
    onKeydown?: (e: KeyboardEvent) => void;
    /** `sm` is the narrow-panel row; the heights match Input and Select. */
    size?: 'sm' | 'md';
  } = $props();

  // Set by the effect below, on mount too.
  let draft = $state('');
  let open = $state(false);
  let highlighted = $state(-1);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  const uid = $props.id();
  const listboxId = uid + '-listbox';
  const field = getFormFieldContext();
  const isInvalid = $derived(invalid || !!field?.invalid);

  // Reads only `value`, so the own writes to `draft` never re-run it.
  $effect(() => {
    draft = value == null ? '' : String(value);
  });

  const filtered = $derived.by(() => {
    const q = draft.trim().toLowerCase();
    return q ? options.filter((o) => String(o).toLowerCase().includes(q)) : options;
  });
  // One-way into bits-ui: the input decides open/closed, never the layer.
  const listOpen = $derived(open && filtered.length > 0 && !!inputEl);

  function commit(raw: string) {
    onValueChange(raw === '' ? null : raw);
    // Resync here too: a caller resetting to the value it already had (ChipInput's
    // '') makes a no-op write that never re-runs the effect above.
    draft = value == null ? '' : String(value);
  }

  function selectOption(opt: string | number) {
    draft = String(opt);
    commit(draft);
    open = false;
    highlighted = -1;
    inputEl?.focus();
  }

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    draft = e.currentTarget.value;
    open = true;
    highlighted = -1;
  }

  function handleFocus() {
    open = true;
    highlighted = -1;
  }

  // A click on the already focused input (after a pick) fires no focus event.
  function handleClick() {
    if (!open) {
      open = true;
      highlighted = -1;
    }
  }

  function handleBlur() {
    if (commitOnBlur) commit(draft);
    else draft = value == null ? '' : String(value);
    open = false;
    highlighted = -1;
  }

  function handleKeydown(e: KeyboardEvent) {
    onKeydown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      highlighted = Math.min(highlighted + 1, filtered.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      open = true;
      highlighted = Math.max(highlighted - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlighted >= 0 && filtered[highlighted] !== undefined) selectOption(filtered[highlighted]);
      else {
        commit(draft);
        open = false;
      }
    } else if (e.key === 'Escape' && open) {
      // Stopped, so a surrounding Dialog doesn't close on it too.
      e.preventDefault();
      e.stopPropagation();
      draft = value == null ? '' : String(value);
      open = false;
      highlighted = -1;
    }
  }
</script>

<div class="combo {className}">
  <input
    bind:this={inputEl}
    class="combo-input combo-input-{size}"
    {type}
    {min}
    {max}
    {disabled}
    {placeholder}
    {title}
    aria-label={ariaLabel}
    id={id ?? field?.controlId}
    aria-describedby={ariaDescribedby ?? field?.describedBy}
    aria-invalid={isInvalid ? 'true' : undefined}
    role="combobox"
    aria-expanded={listOpen}
    aria-controls={listboxId}
    autocomplete="off"
    value={draft}
    oninput={handleInput}
    onfocus={handleFocus}
    onclick={handleClick}
    onblur={handleBlur}
    onkeydown={handleKeydown}
  />
</div>

<BitsPopover.Root open={listOpen} onOpenChange={(v) => { if (!v) open = false; }}>
  <BitsPopover.Portal>
    <BitsPopover.Content
      customAnchor={inputEl ?? null}
      side="bottom"
      align="start"
      sideOffset={4}
      trapFocus={false}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      interactOutsideBehavior="ignore"
      escapeKeydownBehavior="ignore"
    >
      {#snippet child({ props, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
        <div {...wrapperProps}>
          <div {...props} class="combo-menu" id={listboxId} role="listbox">
            {#each filtered as opt, i (opt)}
              <button
                type="button"
                role="option"
                aria-selected={highlighted === i}
                class="combo-opt"
                class:active={highlighted === i}
                onmousedown={(e) => e.preventDefault()}
                onclick={() => selectOption(opt)}
              >{opt}</button>
            {/each}
          </div>
        </div>
      {/snippet}
    </BitsPopover.Content>
  </BitsPopover.Portal>
</BitsPopover.Root>

<style>
  /* Kept in sync with Select.svelte's trigger, list and items by hand. */
  .combo {
    display: inline-flex;
    align-items: center;
    flex: 1 1 auto;
    width: var(--combo-width, 16ch);
    min-width: 0;
    max-width: 100%;
  }
  /* --combo-border / --combo-padding let a host draw the field chrome itself
     (ChipInput); that host also owns the focus ring. */
  .combo-input {
    width: 100%;
    box-sizing: border-box;
    height: var(--combo-height, var(--ds-control-h-md));
    border: var(--combo-border, 1px solid var(--ds-color-border));
    border-radius: var(--ds-radius-sm);
    background: var(--combo-bg, var(--ds-color-bg));
    color: var(--ds-color-fg);
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-field-md);
    padding: var(--combo-padding, 0 0.6rem);
  }
  .combo-input-sm { height: var(--combo-height, var(--ds-control-h-sm)); font-size: var(--ds-text-field-sm); padding: var(--combo-padding, 0 0.4rem); }
  .combo-input[aria-invalid='true'] { border-color: var(--ds-color-danger); }
  .combo-input:not(:disabled):not([aria-invalid='true']):hover { border-color: var(--combo-hover-border, var(--ds-color-border-hover)); }
  .combo-input:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* Not :global(): the panel is this template's own element, through bits-ui's
     `child` (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .combo-menu {
    /* Above a Dialog: the list often opens inside one. */
    z-index: var(--ds-z-floating);
    box-sizing: border-box;
    min-width: var(--bits-floating-anchor-width, 100%);
    width: max-content;
    max-width: 320px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.3rem;
    display: flex;
    flex-direction: column;
    font-family: var(--ds-font-sans);
  }
  /* A native scrollbar crosses the rounded border; the list still scrolls. */
  .combo-menu {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .combo-menu::-webkit-scrollbar { display: none; }
  .combo-opt {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--ds-target-min);
    text-align: left;
    border: 0;
    background: none;
    padding: 0.4rem 0.5rem;
    border-radius: var(--ds-radius-sm);
    color: var(--ds-color-fg);
    cursor: pointer;
    font: inherit;
    font-size: var(--ds-text-md);
  }
  .combo-opt:hover, .combo-opt.active { background: var(--ds-color-fill-hover); }
  .combo-opt:active { background: var(--ds-color-fill-pressed); }
</style>
