<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The section's title is the page's h1: the sidebar is navigation, not a
  // heading (docs/architecture/settings.md). `children` is the page's single Add action.
  import type { Snippet } from 'svelte';
  import { Alert } from '$lib/design-system';

  let {
    title,
    intro,
    error = null,
    children,
  }: {
    title: string;
    intro?: string;
    error?: string | null;
    children?: Snippet;
  } = $props();
</script>

<header class="page-head">
  <div class="page-head-text">
    <h1>{title}</h1>
    {#if intro}<p class="intro">{intro}</p>{/if}
  </div>
  {@render children?.()}
</header>
{#if error}<div class="page-alert"><Alert tone="danger">{error}</Alert></div>{/if}

<style>
  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ds-space-md);
    margin-bottom: var(--ds-space-md);
  }
  .page-head-text { flex: 1 1 26rem; min-width: 0; }
  h1 { margin: 0 0 0.3rem; font-size: 1.35rem; font-weight: var(--ds-weight-semibold); letter-spacing: -0.01em; line-height: 1.25; }
  .intro { margin: 0; color: var(--ds-color-muted); font-size: var(--ds-text-sm); line-height: 1.5; max-width: 64ch; }
  .page-alert { margin-bottom: var(--ds-space-md); }
</style>
