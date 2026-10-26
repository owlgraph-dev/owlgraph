<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A setting's name and description beside its control. The row is its own
  // query container, so it stacks at its own width, not the viewport's.
  import type { Snippet } from 'svelte';

  let {
    label,
    description,
    for: forId,
    layout = 'split',
    class: className = '',
    children,
  }: {
    label: string;
    description?: string;
    /** Ties the label to one control's id; without it the row is a labelled group. */
    for?: string;
    /** `wide` puts the control full-width beneath the text. */
    layout?: 'split' | 'wide';
    class?: string;
    children?: Snippet;
  } = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
</script>

<div
  class="ds-settings-row ds-settings-row-{layout} {className}"
  role={forId ? undefined : 'group'}
  aria-labelledby={forId ? undefined : labelId}
>
  <div class="ds-settings-row-grid">
  <div class="ds-settings-row-text">
    {#if forId}
      <label class="ds-settings-row-label" for={forId} id={labelId}>{label}</label>
    {:else}
      <span class="ds-settings-row-label" id={labelId}>{label}</span>
    {/if}
    {#if description}<p class="ds-settings-row-desc">{description}</p>{/if}
  </div>
  <div class="ds-settings-row-control">
    {@render children?.()}
  </div>
  </div>
</div>

<style>
  .ds-settings-row {
    container-type: inline-size;
    padding: 1.1rem 0;
    border-bottom: 1px solid var(--ds-color-border);
    font-family: var(--ds-font-sans);
  }
  .ds-settings-row-grid {
    display: grid;
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
    gap: 0.5rem 2rem;
    align-items: start;
  }
  .ds-settings-row-wide .ds-settings-row-grid { grid-template-columns: minmax(0, 1fr); }
  .ds-settings-row-text { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .ds-settings-row-label {
    font-size: var(--ds-text-md);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
    line-height: 1.35;
  }
  .ds-settings-row-desc {
    margin: 0;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
    line-height: 1.5;
    max-width: 48ch;
  }
  .ds-settings-row-control { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: var(--ds-space-sm); }
  .ds-settings-row-wide .ds-settings-row-control { align-items: stretch; }
  @container (max-width: 560px) {
    .ds-settings-row-grid { grid-template-columns: minmax(0, 1fr); }
    .ds-settings-row-desc { max-width: none; }
  }
</style>
