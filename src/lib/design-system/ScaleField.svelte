<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A named scale, then a custom number. Each step's name is drawn at its
  // `preview`, a static length: the list portals out of whatever a token would
  // resolve against. Only the two groups; the row label stays with the caller.
  import Combobox from './Combobox.svelte';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(null),
    onValueChange,
    steps,
    stepsLabel,
    customLabel,
    customTitle,
    customPlaceholder,
    customOptions = [],
    min,
    max,
    mixed = false,
    class: className = '',
  }: {
    value?: string | number | null;
    onValueChange?: (value: string | number | null) => void;
    /** Smallest first: `value` is stored, `hint` shown muted, `preview` the CSS
     * font-size to draw the name at (keep it bounded to fit a popover). */
    steps: { value: string; label: string; hint: string; preview: string }[];
    /** Names the step group (visible, and the group's accessible name). */
    stepsLabel: string;
    /** Names the custom group. */
    customLabel: string;
    /** The custom entry's title and accessible name. */
    customTitle: string;
    customPlaceholder?: string;
    /** Suggestions for the custom entry. */
    customOptions?: readonly number[];
    min?: number;
    max?: number;
    /** Shows nothing chosen (a selection of differing values), keeping `value`. */
    mixed?: boolean;
    class?: string;
  } = $props();

  const customValue = $derived(!mixed && typeof value === 'number' ? value : '');

  function pick(next: string | number | null) {
    value = next;
    onValueChange?.(next);
  }

  // The Combobox commits on blur even when empty, so an empty commit clears only
  // a custom number: tabbing through must not drop a chosen step.
  function commitCustom(raw: string | null) {
    if (raw == null) {
      if (typeof value === 'number') pick(null);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) pick(n);
  }
</script>

<div class="ds-scale-field {className}">
  <div class="ds-scale-group" role="group" aria-label={stepsLabel}>
    <span class="ds-scale-group-label" aria-hidden="true">{stepsLabel}</span>
    <div class="ds-scale-list">
      {#each steps as step (step.value)}
        {@const selected = !mixed && value === step.value}
        <button type="button" class="ds-scale-item" aria-pressed={selected} onclick={() => pick(step.value)}>
          <span class="ds-scale-check" aria-hidden="true">{#if selected}<Icon name="check" size={14} />{/if}</span>
          <span class="ds-scale-name" style:font-size={step.preview}>{step.label}</span>
          <span class="ds-scale-hint">{step.hint}</span>
        </button>
      {/each}
    </div>
  </div>
  <div class="ds-scale-group" role="group" aria-label={customLabel}>
    <span class="ds-scale-group-label" aria-hidden="true">{customLabel}</span>
    <Combobox
      type="number"
      size="sm"
      {min}
      {max}
      options={customOptions}
      value={customValue}
      placeholder={customPlaceholder}
      title={customTitle}
      ariaLabel={customTitle}
      onValueChange={commitCustom}
    />
  </div>
</div>

<style>
  .ds-scale-field { display: flex; flex-direction: column; gap: var(--ds-space-sm); min-width: 11rem; }
  .ds-scale-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .ds-scale-group-label { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .ds-scale-list { display: flex; flex-direction: column; }
  .ds-scale-item {
    display: flex;
    /* A wrapping flex box centres its line in the touch-height row, and the
       name and hint keep their baseline. */
    flex-wrap: wrap;
    align-content: center;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    min-height: max(1.5rem, var(--ds-target-min));
    padding: 0.2rem 0.5rem;
    border: none;
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    text-align: start;
    cursor: pointer;
  }
  .ds-scale-item:hover { background: var(--ds-color-fill-hover); }
  .ds-scale-item:active { background: var(--ds-color-fill-pressed); }
  .ds-scale-item[aria-pressed='true'] { font-weight: var(--ds-weight-medium); }
  .ds-scale-check {
    display: inline-flex;
    flex: none;
    align-self: center;
    width: 1em;
    color: var(--ds-color-accent);
  }
  .ds-scale-name { line-height: 1.2; }
  .ds-scale-hint { margin-inline-start: auto; font-size: var(--ds-text-xs); color: var(--ds-color-muted); font-weight: var(--ds-weight-normal); }
</style>
