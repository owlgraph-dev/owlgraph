<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The hits list above the tree, never replacing it: no second mode to keep in
  // sync. It sees only the tree the sidebar shows, so a hidden section can't be
  // found by name.
  import { goto } from '$app/navigation';
  import { Input, EmptyState } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { leavesSettings, searchItems, type SettingsGroup } from './treeModel';

  let {
    groups,
    onNavigate,
  }: {
    groups: SettingsGroup[];
    onNavigate?: () => void;
  } = $props();

  let query = $state('');
  const hits = $derived(searchItems(groups, query));
  const active = $derived(query.trim().length > 0);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      query = '';
      return;
    }
    if (e.key === 'Enter' && hits.length > 0) {
      e.preventDefault();
      const href = hits[0].item.href;
      query = '';
      onNavigate?.();
      // Out of the settings, the page needs its own policy: a full load.
      if (leavesSettings(href)) location.assign(href);
      else goto(href);
    }
  }

  function pick() {
    query = '';
    onNavigate?.();
  }
</script>

<div class="search" role="search">
  <Input
    type="search"
    bind:value={query}
    placeholder={m.settings_search_placeholder()}
    aria-label={m.settings_search_placeholder()}
    autocomplete="off"
    onkeydown={onKeydown}
  />
  {#if active}
    <div class="results" aria-live="polite" aria-label={m.settings_search_results_aria()}>
      {#if hits.length === 0}
        <div class="none"><EmptyState size="sm">{m.settings_search_none()}</EmptyState></div>
      {:else}
        <ul>
          {#each hits as hit (hit.item.id)}
            <li>
              <a href={hit.item.href} data-sveltekit-reload={leavesSettings(hit.item.href) || undefined} onclick={pick}>
                <span class="hit-group">{hit.group.label()}</span>
                <span class="hit-label">{hit.item.label()}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .results {
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    background: var(--ds-color-bg);
    padding: 0.25rem;
  }
  .results ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .results a {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    padding: 0.4rem 0.55rem;
    border-radius: var(--ds-radius-sm);
    text-decoration: none;
    color: var(--ds-color-fg);
  }
  /* Not the focus indicator: the app.css ring stays on top. */
  .results a:hover, .results a:focus-visible { background: var(--ds-color-accent-soft); }
  .hit-group { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .hit-label { font-size: var(--ds-text-md); font-weight: var(--ds-weight-medium); }
  .none { padding: 0.4rem 0.55rem; }
</style>
