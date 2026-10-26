<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An on/off choice saved with others; a Switch applies at once. The label is
  // inside the control, so the whole row is the target and its text the name.
  // Several with one `name` post the checked values as a list.
  import { Checkbox as BitsCheckbox } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    checked = $bindable(false),
    onCheckedChange,
    indeterminate = false,
    disabled = false,
    name,
    value,
    ariaLabel,
    size = 'md',
    class: className = '',
    children,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    indeterminate?: boolean;
    disabled?: boolean;
    /** Posts as a form field (a hidden input) with this name. */
    name?: string;
    /** The posted value when checked (default "on"). */
    value?: string;
    /** Accessible name when there is no visible label (children). */
    ariaLabel?: string;
    /** `sm` is the narrow-panel row, `md` the form and dialog row. */
    size?: 'sm' | 'md';
    class?: string;
    /** The label beside the box. */
    children?: Snippet;
  } = $props();
</script>

<BitsCheckbox.Root bind:checked {onCheckedChange} {indeterminate} {disabled} {name} {value}>
  {#snippet child({ props, checked: isChecked, indeterminate: isIndeterminate }: { props: Record<string, unknown>; checked: boolean; indeterminate: boolean })}
    <button {...props} class="ds-checkbox ds-checkbox-{size} {className}" class:ds-checkbox-bare={!children} aria-label={ariaLabel}>
      <span class="ds-checkbox-box" aria-hidden="true">
        {#if isIndeterminate}
          <span class="ds-checkbox-dash"></span>
        {:else if isChecked}
          <Icon name="check" size={size === 'sm' ? 12 : 14} />
        {/if}
      </span>
      {#if children}<span class="ds-checkbox-label">{@render children()}</span>{/if}
    </button>
  {/snippet}
</BitsCheckbox.Root>

<style>
  .ds-checkbox {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--ds-space-sm);
    min-width: 0;
    min-height: 1.5rem;
    /* The label's first line centres in a touch-height row; the box keeps to it. */
    padding: max(0px, calc((var(--ds-target-min) - 1lh) / 2)) 0;
    border: 0;
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    font: inherit;
    font-family: var(--ds-font-sans);
    text-align: left;
    cursor: pointer;
  }
  /* Without a label the target stays 24px square (WCAG 2.5.8). */
  .ds-checkbox-bare { min-width: max(1.5rem, var(--ds-target-min)); min-height: max(1.5rem, var(--ds-target-min)); padding: 0; align-items: center; justify-content: center; }
  .ds-checkbox-bare .ds-checkbox-box { margin-top: 0; }
  .ds-checkbox-md { font-size: var(--ds-text-md); }
  .ds-checkbox-sm { font-size: var(--ds-text-sm); }
  .ds-checkbox[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* The edge alone carries the unchecked state, so it meets 3:1 on the page. */
  .ds-checkbox-box {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 1rem;
    height: 1rem;
    margin-top: calc((1.5em - 1rem) / 2);
    border: 1.5px solid var(--ds-color-border-strong);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-raised);
    color: var(--ds-color-on-accent);
  }
  .ds-checkbox-sm .ds-checkbox-box { width: 0.875rem; height: 0.875rem; margin-top: calc((1.5em - 0.875rem) / 2); }
  .ds-checkbox[data-state='checked'] .ds-checkbox-box,
  .ds-checkbox[data-state='indeterminate'] .ds-checkbox-box { background: var(--ds-color-accent); border-color: var(--ds-color-accent); }
  .ds-checkbox-dash { width: 0.5rem; height: 2px; border-radius: 1px; background: currentColor; }
  .ds-checkbox-label { min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
  .ds-checkbox:not([data-disabled]):hover .ds-checkbox-box { border-color: var(--ds-color-border-strong-hover); }
  .ds-checkbox:not([data-disabled]):active .ds-checkbox-box { border-color: var(--ds-color-border-strong-pressed); background: var(--ds-color-fill-hover); }
  .ds-checkbox[data-state='checked']:not([data-disabled]):hover .ds-checkbox-box,
  .ds-checkbox[data-state='indeterminate']:not([data-disabled]):hover .ds-checkbox-box { background: var(--ds-color-accent-hover); border-color: var(--ds-color-accent-hover); }
  .ds-checkbox[data-state='checked']:not([data-disabled]):active .ds-checkbox-box,
  .ds-checkbox[data-state='indeterminate']:not([data-disabled]):active .ds-checkbox-box { background: var(--ds-color-accent-pressed); border-color: var(--ds-color-accent-pressed); }
</style>
