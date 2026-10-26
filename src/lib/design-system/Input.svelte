<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { getFormFieldContext } from './formField';

  let {
    value = $bindable(''),
    type = 'text',
    size = 'md',
    disabled = false,
    placeholder,
    class: className = '',
    autofocus = false,
    ...rest
  }: {
    value?: string | number;
    type?: string;
    /** `sm` is the narrow-panel row; `lg` the touch sheet, at least 16px so iOS
     * doesn't zoom on focus. The heights match Button, Select and NumberField. */
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    placeholder?: string;
    class?: string;
    /** Focuses and selects the contents once, on mount (`use:` can't cross the
     * component boundary). */
    autofocus?: boolean;
    [key: string]: unknown;
  } = $props();

  // A surrounding FormField's wiring; props passed directly (rest, spread last) win.
  const field = getFormFieldContext();

  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (autofocus) {
      inputEl?.focus();
      inputEl?.select();
    }
  });
</script>

<input
  bind:this={inputEl}
  {type}
  bind:value
  {disabled}
  {placeholder}
  id={field?.controlId}
  aria-describedby={field?.describedBy}
  aria-invalid={field?.invalid ? 'true' : undefined}
  class="ds-input ds-input-{size} {className}"
  {...rest}
/>

<style>
  .ds-input {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    font-family: var(--ds-font-sans);
    color: var(--ds-color-fg);
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
  }
  .ds-input:not(:disabled):not([aria-invalid='true']):hover { border-color: var(--ds-color-border-hover); }
  .ds-input:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* The error state is the `aria-invalid` a screen reader announces, so the two
     can't drift. */
  .ds-input[aria-invalid='true'] { border-color: var(--ds-color-danger); }
  .ds-input-md { height: var(--ds-control-h-md); padding: 0 0.6rem; font-size: var(--ds-text-field-md); }
  .ds-input-sm { height: var(--ds-control-h-sm); padding: 0 0.4rem; font-size: var(--ds-text-field-sm); }
  .ds-input-lg { height: var(--ds-control-h-lg); padding: 0 0.75rem; font-size: var(--ds-text-lg); }
</style>
