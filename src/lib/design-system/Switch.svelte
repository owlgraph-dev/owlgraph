<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Switch as BitsSwitch } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    checked = $bindable(false),
    onCheckedChange,
    disabled = false,
    ariaLabel,
    size = 'md',
    class: className = '',
    children,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    /** Accessible name when the visible label is outside (a FieldRow's). */
    ariaLabel?: string;
    /** `sm`: a smaller track and label for a dense panel row. */
    size?: 'sm' | 'md';
    class?: string;
    /** The label beside the track. */
    children?: Snippet;
  } = $props();
</script>

<BitsSwitch.Root bind:checked {onCheckedChange} {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <button {...props} class="ds-switch ds-switch-{size} {className}" aria-label={ariaLabel}>
      <span class="ds-switch-track"><span class="ds-switch-thumb"></span></span>
      {#if children}<span class="ds-switch-label">{@render children()}</span>{/if}
    </button>
  {/snippet}
</BitsSwitch.Root>

<style>
  .ds-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    /* Without a label the track alone is the target: 44px on touch. */
    min-width: var(--ds-target-min);
    min-height: var(--ds-target-min);
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
  }
  .ds-switch[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-switch-track {
    width: 2.1rem;
    height: 1.2rem;
    border-radius: var(--ds-radius-pill);
    /* The off track alone carries the off state, so it meets 3:1 on the page. */
    background: var(--ds-color-border-strong);
    position: relative;
    transition: background 0.15s;
    flex: 0 0 auto;
  }
  .ds-switch[data-state='checked'] .ds-switch-track { background: var(--ds-color-accent); }
  /* Hover deepens the track in its own state's colour, never changing what it reads. */
  .ds-switch:not([data-disabled]):hover .ds-switch-track { background: var(--ds-color-border-strong-hover); }
  .ds-switch:not([data-disabled]):active .ds-switch-track { background: var(--ds-color-border-strong-pressed); }
  .ds-switch[data-state='checked']:not([data-disabled]):hover .ds-switch-track { background: var(--ds-color-accent-hover); }
  .ds-switch[data-state='checked']:not([data-disabled]):active .ds-switch-track { background: var(--ds-color-accent-pressed); }
  .ds-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 50%;
    background: var(--ds-color-raised);
    transition: left 0.15s;
  }
  .ds-switch[data-state='checked'] .ds-switch-thumb { left: calc(2.1rem - 0.9rem - 2px); }
  /* The row stays at least 24px tall, the target minimum. */
  .ds-switch-sm { min-height: max(1.5rem, var(--ds-target-min)); font-size: var(--ds-text-sm); gap: 0.45rem; }
  .ds-switch-sm .ds-switch-track { width: 1.75rem; height: 1rem; }
  .ds-switch-sm .ds-switch-thumb { width: 0.75rem; height: 0.75rem; }
  .ds-switch-sm[data-state='checked'] .ds-switch-thumb { left: calc(1.75rem - 0.75rem - 2px); }
</style>
