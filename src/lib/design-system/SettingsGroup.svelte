<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A titled group of SettingsRows; sections are separated by space and a rule,
  // not by cards.
  import type { Snippet } from 'svelte';

  let {
    title,
    intro,
    class: className = '',
    children,
  }: {
    title: string;
    intro?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<section class="ds-settings-group {className}">
  <header class="ds-settings-group-head">
    <h2 class="ds-settings-group-title">{title}</h2>
    {#if intro}<p class="ds-settings-group-intro">{intro}</p>{/if}
  </header>
  <div class="ds-settings-group-body">
    {@render children?.()}
  </div>
</section>

<style>
  .ds-settings-group { margin: 0 0 2.5rem; font-family: var(--ds-font-sans); }
  .ds-settings-group-head { margin-bottom: 0.25rem; }
  .ds-settings-group-title {
    margin: 0;
    font-size: var(--ds-text-lg);
    font-weight: var(--ds-weight-semibold);
    line-height: 1.3;
  }
  .ds-settings-group-intro {
    margin: 0.25rem 0 0;
    color: var(--ds-color-muted);
    font-size: var(--ds-text-sm);
    line-height: 1.5;
    max-width: 64ch;
  }
  .ds-settings-group-body { border-top: 1px solid var(--ds-color-border); margin-top: 0.75rem; }
</style>
