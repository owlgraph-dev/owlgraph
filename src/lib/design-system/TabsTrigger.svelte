<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // With `href` the tab is a real <a>, navigating without JS. Bits' keydown
  // preventDefault()s Enter/Space, which would swallow the navigation, so
  // onLinkKeydown (merged first) clicks the link: a click(), not `goto()`,
  // keeps the design system free of $app/* imports.
  import { Tabs as BitsTabs } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value,
    href,
    disabled = false,
    class: className = '',
    children,
  }: {
    value: string;
    /** Renders an <a> and makes the tab a navigation, not a panel swap. */
    href?: string;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();

  function onLinkKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLAnchorElement).click();
    }
  }
</script>

{#if href}
  <BitsTabs.Trigger {value} {disabled} onkeydown={onLinkKeydown}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <a {...props} {href} type={undefined} class="ds-tab {className}">
        {@render children?.()}
      </a>
    {/snippet}
  </BitsTabs.Trigger>
{:else}
  <BitsTabs.Trigger {value} {disabled}>
    {#snippet child({ props }: { props: Record<string, unknown> })}
      <button {...props} type="button" class="ds-tab {className}">
        {@render children?.()}
      </button>
    {/snippet}
  </BitsTabs.Trigger>
{/if}

<style>
  .ds-tab {
    display: inline-flex;
    align-items: center;
    min-height: var(--ds-target-min);
    padding: var(--ds-space-sm) 0.8rem;
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    color: var(--ds-color-muted);
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    /* The radius only rounds the focus ring. */
    border-radius: var(--ds-radius-sm);
  }
  .ds-tab:not([data-disabled]):not([data-state='active']):hover { color: var(--ds-color-fg); }
  .ds-tab[data-state='active'] {
    color: var(--ds-color-accent);
    border-bottom-color: var(--ds-color-accent);
    font-weight: var(--ds-weight-medium);
  }
  .ds-tab[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
</style>
