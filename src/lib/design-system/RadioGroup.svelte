<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One value from a short list, for a form choice other fields depend on; a
  // choice applied at once is a SegmentedControl, a long list a Select. Inside
  // a `FormField group` the field's label names the group.
  import { RadioGroup as BitsRadioGroup } from 'bits-ui';
  import { getFormFieldContext } from './formField';

  interface RadioItem {
    value: string;
    label: string;
    disabled?: boolean;
  }

  let {
    items,
    value = $bindable(''),
    onValueChange,
    name,
    disabled = false,
    orientation = 'horizontal',
    size = 'md',
    ariaLabel,
    class: className = '',
  }: {
    items: RadioItem[];
    value?: string;
    onValueChange?: (value: string) => void;
    /** Posts the chosen value as a form field with this name. */
    name?: string;
    disabled?: boolean;
    /** `horizontal` wraps the options in a row; `vertical` stacks them. */
    orientation?: 'horizontal' | 'vertical';
    size?: 'sm' | 'md';
    /** Names the group when no FormField label does. */
    ariaLabel?: string;
    class?: string;
  } = $props();

  const field = getFormFieldContext();
</script>

<BitsRadioGroup.Root bind:value {onValueChange} {name} {disabled} {orientation}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div
      {...props}
      class="ds-radio-group ds-radio-group-{orientation} ds-radio-group-{size} {className}"
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && field ? field.labelId : undefined}
      aria-describedby={field?.describedBy}
    >
      {#each items as item (item.value)}
        <BitsRadioGroup.Item value={item.value} disabled={item.disabled}>
          {#snippet child({ props: itemProps }: { props: Record<string, unknown> })}
            <button {...itemProps} class="ds-radio">
              <span class="ds-radio-dot" aria-hidden="true"></span>
              <span class="ds-radio-label">{item.label}</span>
            </button>
          {/snippet}
        </BitsRadioGroup.Item>
      {/each}
    </div>
  {/snippet}
</BitsRadioGroup.Root>

<style>
  .ds-radio-group { display: flex; gap: 0.3rem 1rem; font-family: var(--ds-font-sans); }
  .ds-radio-group-horizontal { flex-wrap: wrap; }
  .ds-radio-group-vertical { flex-direction: column; }
  .ds-radio-group-md { font-size: var(--ds-text-md); }
  .ds-radio-group-sm { font-size: var(--ds-text-sm); }
  .ds-radio {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--ds-space-sm);
    min-height: 1.5rem;
    /* The label's first line centres in a touch-height row; the dot keeps to it. */
    padding: max(0px, calc((var(--ds-target-min) - 1lh) / 2)) 0;
    border: 0;
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ds-radio[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* The ring alone carries the unchecked state, so it meets 3:1 on the page. */
  .ds-radio-dot {
    position: relative;
    flex: none;
    box-sizing: border-box;
    width: 1rem;
    height: 1rem;
    margin-top: calc((1.5em - 1rem) / 2);
    border: 1.5px solid var(--ds-color-border-strong);
    border-radius: 50%;
    background: var(--ds-color-raised);
  }
  .ds-radio[data-state='checked'] .ds-radio-dot { border-color: var(--ds-color-accent); }
  .ds-radio[data-state='checked'] .ds-radio-dot::after {
    content: '';
    position: absolute;
    inset: 0.1875rem;
    border-radius: 50%;
    background: var(--ds-color-accent);
  }
  .ds-radio-label { line-height: 1.5; }
  .ds-radio:not([data-disabled]):hover .ds-radio-dot { border-color: var(--ds-color-border-strong-hover); }
  .ds-radio:not([data-disabled]):active .ds-radio-dot { border-color: var(--ds-color-border-strong-pressed); background: var(--ds-color-fill-hover); }
  .ds-radio[data-state='checked']:not([data-disabled]):hover .ds-radio-dot { border-color: var(--ds-color-accent-hover); }
  .ds-radio[data-state='checked']:not([data-disabled]):hover .ds-radio-dot::after { background: var(--ds-color-accent-hover); }
  .ds-radio[data-state='checked']:not([data-disabled]):active .ds-radio-dot { border-color: var(--ds-color-accent-pressed); }
  .ds-radio[data-state='checked']:not([data-disabled]):active .ds-radio-dot::after { background: var(--ds-color-accent-pressed); }
</style>
