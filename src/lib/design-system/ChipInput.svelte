<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Chips plus a free-text entry (Combobox: a value needn't be in `suggestions`).
  // This wrapper is the frame; the entry never commits on blur, so a half-typed
  // value never becomes a chip.
  import Combobox from './Combobox.svelte';
  import { getFormFieldContext, setFormFieldContext } from './formField';
  import Chip from './Chip.svelte';

  let {
    value = $bindable([]),
    onValueChange,
    suggestions = [],
    placeholder = '',
    max,
    disabled = false,
    ariaLabel,
    id,
    invalid = false,
    removeLabel,
    size = 'md',
    class: className = '',
  }: {
    value?: string[];
    onValueChange?: (value: string[]) => void;
    suggestions?: readonly string[];
    placeholder?: string;
    /** Maximum number of chips; the entry hides once reached. */
    max?: number;
    disabled?: boolean;
    ariaLabel?: string;
    /** The entry input's id (a FormField supplies it). */
    id?: string;
    /** Error state on the entry and the frame. */
    invalid?: boolean;
    /** The translated label of a chip's remove button. */
    removeLabel: string;
    /** `sm` is the narrow-panel row; chips wrap onto more lines. */
    size?: 'sm' | 'md';
    class?: string;
  } = $props();

  // Cleared for the inner Combobox, which is wired explicitly below.
  const field = getFormFieldContext();
  setFormFieldContext(null);
  const isInvalid = $derived(invalid || !!field?.invalid);

  const lc = (s: string) => s.trim().toLowerCase();
  const full = $derived(max != null && value.length >= max);
  // Case-insensitive, as the server compares.
  const remaining = $derived(suggestions.filter((s) => !value.some((v) => lc(v) === lc(s))));

  function add(raw: string | null) {
    const v = (raw ?? '').trim();
    if (!v || full) return;
    if (value.some((x) => lc(x) === lc(v))) return;
    set([...value, v]);
  }

  function removeAt(i: number) {
    set(value.filter((_, j) => j !== i));
  }

  function set(next: string[]) {
    value = next;
    onValueChange?.(next);
  }

  // Backspace in an empty entry removes the last chip.
  function onEntryKeydown(e: KeyboardEvent) {
    if (e.key !== 'Backspace' || disabled) return;
    const target = e.target as HTMLInputElement | null;
    if (target?.value === '' && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }
</script>

<div class="ds-chip-input ds-chip-input-{size} {className}" class:ds-chip-input--disabled={disabled} class:ds-chip-input--invalid={isInvalid} role="group" aria-label={ariaLabel} aria-disabled={disabled || undefined}>
  {#each value as chip, i (chip)}
    <Chip label={chip} {removeLabel} onRemove={disabled ? undefined : () => removeAt(i)} />
  {/each}
  {#if !full && !disabled}
    <Combobox
      value=""
      options={remaining}
      onValueChange={add}
      commitOnBlur={false}
      onKeydown={onEntryKeydown}
      placeholder={value.length === 0 ? placeholder : ''}
      {ariaLabel}
      id={id ?? field?.controlId}
      ariaDescribedby={field?.describedBy}
      invalid={isInvalid}
      class="ds-chip-entry"
      size={size}
    />
  {/if}
</div>

<style>
  .ds-chip-input {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
    min-height: var(--ds-control-h-md);
    box-sizing: border-box;
    --ds-chip-pad-y: 0.2rem;
    --ds-chip-entry-bleed: 0px;
    padding: var(--ds-chip-pad-y) 0.4rem;
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    font-family: var(--ds-font-sans);
    cursor: text;
    /* Inherited by the Combobox, never passed as `--combo-*` props: Svelte
       renders those as a style attribute, which the strict style-src blocks. */
    --combo-width: auto;
    --combo-border: 0;
    --combo-hover-border: transparent;
    --combo-bg: transparent;
    --combo-padding: 0 0.2rem;
    --combo-height: calc(var(--ds-control-h-md) - 2 * var(--ds-chip-pad-y) - 2px + 2 * var(--ds-chip-entry-bleed));
  }
  .ds-chip-input-sm {
    min-height: var(--ds-control-h-sm);
    --ds-chip-pad-y: 0.15rem;
    padding: var(--ds-chip-pad-y) 0.3rem;
    --combo-height: calc(var(--ds-control-h-sm) - 2 * var(--ds-chip-pad-y) - 2px + 2 * var(--ds-chip-entry-bleed));
  }
  /* On touch the entry is a 44px target bleeding over the frame's borders, so
     the frame keeps the control height. */
  @media (pointer: coarse) {
    .ds-chip-input { --ds-chip-pad-y: 0px; --ds-chip-entry-bleed: 1px; }
    :global(.ds-chip-input .ds-chip-entry) { margin-block: calc(-1 * var(--ds-chip-entry-bleed)); }
  }
  .ds-chip-input--invalid { border-color: var(--ds-color-danger); }
  .ds-chip-input:not(.ds-chip-input--disabled):not(.ds-chip-input--invalid):hover { border-color: var(--ds-color-border-hover); }
  /* The frame is the visible control, so it draws the ring and the entry
     suppresses its own (the composite-frame exception). */
  .ds-chip-input:focus-within {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-chip-input--disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* :global(): the class lands on Combobox's own root, through its `class` prop. */
  :global(.ds-chip-input .ds-chip-entry) { flex: 1 1 6ch; min-width: 6ch; width: auto; }
  :global(.ds-chip-input .ds-chip-entry input:focus-visible) { outline: none; }
</style>
