<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A small static label for a category or status beside a name; a removable
  // value is a Chip.
  import type { Snippet } from 'svelte';

  let {
    tone = 'neutral',
    title,
    class: className = '',
    children,
  }: {
    /** `success` / `warning` / `danger` mark a change's kind or a status. */
    tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';
    title?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<span class="ds-badge ds-badge-{tone} {className}" {title}>{@render children?.()}</span>

<style>
  .ds-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.4rem;
    border-radius: var(--ds-radius-sm);
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-xs);
    font-weight: var(--ds-weight-semibold);
    line-height: 1.4;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  /* On the well, not the border: muted text on the border falls under 4.5:1. */
  .ds-badge-neutral { background: var(--ds-color-well); color: var(--ds-color-muted); }
  .ds-badge-accent { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }
  .ds-badge-info { background: var(--ds-color-info-soft); color: var(--ds-color-info); }
  .ds-badge-success { background: var(--ds-color-success-soft); color: var(--ds-color-success); }
  .ds-badge-warning { background: var(--ds-color-warning-soft); color: var(--ds-color-warning); }
  .ds-badge-danger { background: var(--ds-color-danger-soft); color: var(--ds-color-danger); }
</style>
