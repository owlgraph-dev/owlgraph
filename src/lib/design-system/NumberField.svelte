<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A short numeric box with a unit inside the frame; not Input, which is full
  // width with no adornment. A commit clamps to min/max, rounds to a whole step
  // and maps an empty or unparsable entry to null.
  import { getFormFieldContext } from './formField';

  let {
    value = $bindable(null),
    onValueChange,
    min,
    max,
    step = 1,
    unit,
    placeholder,
    ariaLabel,
    id,
    width = 'auto',
    size = 'md',
    disabled = false,
    invalid = false,
    class: className = '',
  }: {
    /** null is unset: empty, showing `placeholder` (the inherited value). */
    value?: number | null;
    onValueChange?: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    placeholder?: string;
    ariaLabel?: string;
    id?: string;
    /** `auto` (default) is a short fixed box; `full` fills its container. */
    width?: 'auto' | 'full';
    /** `sm` for the block settings row. */
    size?: 'sm' | 'md';
    disabled?: boolean;
    /** Error state (a FormField with an error sets it). */
    invalid?: boolean;
    class?: string;
  } = $props();

  const field = getFormFieldContext();
  const isInvalid = $derived(invalid || !!field?.invalid);

  function set(v: number | null) {
    value = v;
    onValueChange?.(v);
  }

  function commit(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    if (raw === '') { set(null); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { set(null); return; }
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    if (Number.isInteger(step)) v = Math.round(v);
    set(v);
  }
</script>

<span class="ds-numfield ds-numfield-{size} ds-numfield-{width} {className}" class:ds-numfield-disabled={disabled} class:ds-numfield-invalid={isInvalid} aria-disabled={disabled || undefined}>
  <input
    type="number"
    id={id ?? field?.controlId}
    aria-describedby={field?.describedBy}
    aria-invalid={isInvalid ? 'true' : undefined}
    {min}
    {max}
    {step}
    {disabled}
    {placeholder}
    aria-label={ariaLabel}
    value={value ?? ''}
    onchange={commit}
  />
  {#if unit}<span class="ds-numfield-unit" aria-hidden="true">{unit}</span>{/if}
</span>

<style>
  .ds-numfield {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    width: 5.5rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
    font-family: var(--ds-font-sans);
    color: var(--ds-color-fg);
  }
  .ds-numfield-invalid { border-color: var(--ds-color-danger); }
  .ds-numfield:not(.ds-numfield-disabled):not(.ds-numfield-invalid):hover { border-color: var(--ds-color-border-hover); }
  /* The frame is the visible control, so it draws the ring and the input
     suppresses its own (the composite-frame exception). */
  .ds-numfield:focus-within {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-numfield-disabled { opacity: var(--ds-opacity-disabled); }
  .ds-numfield-full { width: 100%; }
  .ds-numfield input {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: right;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .ds-numfield input::-webkit-outer-spin-button,
  .ds-numfield input::-webkit-inner-spin-button { appearance: none; margin: 0; }
  .ds-numfield input::placeholder { color: var(--ds-color-muted); }
  /* The frame carries the control height; the input fills it. */
  .ds-numfield-sm { height: var(--ds-control-h-sm); }
  .ds-numfield-md { height: var(--ds-control-h-md); }
  .ds-numfield-sm input { height: 100%; padding: 0 0.35rem; font-size: var(--ds-text-field-sm); }
  .ds-numfield-md input { height: 100%; padding: 0 0.5rem; font-size: var(--ds-text-field-md); }
  .ds-numfield-unit { flex: none; padding: 0 0.4rem 0 0; font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
</style>
