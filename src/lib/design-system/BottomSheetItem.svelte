<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A menu row in a BottomSheet: DropdownMenuItem needs a DropdownMenu root the
  // sheet doesn't have. A link with `href`, else a button; other attributes pass
  // through.
  import type { Snippet } from 'svelte';

  let {
    href,
    active = false,
    variant = 'default',
    class: className = '',
    children,
    trailing,
    ...rest
  }: {
    href?: string;
    /** The current page: accent tint and aria-current. */
    active?: boolean;
    variant?: 'default' | 'danger';
    class?: string;
    children: Snippet;
    /** An end-aligned mark (a group's chevron). */
    trailing?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

{#if href}
  <a
    {href}
    class="ds-sheet-item ds-sheet-item-{variant} {className}"
    class:ds-sheet-item-active={active}
    aria-current={active ? 'page' : undefined}
    {...rest}
  >
    <span class="ds-sheet-item-label">{@render children()}</span>
    {#if trailing}<span class="ds-sheet-item-trailing">{@render trailing()}</span>{/if}
  </a>
{:else}
  <button type="button" class="ds-sheet-item ds-sheet-item-{variant} {className}" class:ds-sheet-item-active={active} {...rest}>
    <span class="ds-sheet-item-label">{@render children()}</span>
    {#if trailing}<span class="ds-sheet-item-trailing">{@render trailing()}</span>{/if}
  </button>
{/if}

<style>
  .ds-sheet-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ds-space-sm);
    width: 100%;
    min-height: var(--ds-control-h-lg);
    box-sizing: border-box;
    padding: 0 0.55rem;
    border: 0;
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .ds-sheet-item-label { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  .ds-sheet-item-trailing { display: inline-flex; flex: none; color: var(--ds-color-muted); }
  .ds-sheet-item:hover { background: var(--ds-color-fill-hover); }
  .ds-sheet-item:active { background: var(--ds-color-fill-pressed); }
  .ds-sheet-item-danger { color: var(--ds-color-danger); }
  .ds-sheet-item-active, .ds-sheet-item-active:hover { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }
  .ds-sheet-item-active:active { background: var(--ds-color-accent-soft-pressed); }
</style>
