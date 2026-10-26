<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `groups` is the tree already filtered by the viewer's permissions. A link
  // out of the settings is a full navigation (leavesSettings).
  import * as m from '$lib/paraglide/messages';
  import SettingsSearch from './SettingsSearch.svelte';
  import { OVERVIEW } from './tree';
  import { OVERVIEW_ID, leavesSettings, type SettingsGroup } from './treeModel';

  let {
    groups,
    activeId,
    onNavigate,
  }: {
    groups: SettingsGroup[];
    activeId: string;
    /** Called after a link is picked (the sheet closes itself with it). */
    onNavigate?: () => void;
  } = $props();
</script>

<nav class="settings-nav" aria-label={m.settings_nav_aria()}>
  <SettingsSearch {groups} {onNavigate} />

  <a
    class="item item-top"
    class:active={activeId === OVERVIEW_ID}
    href={OVERVIEW.href}
    aria-current={activeId === OVERVIEW_ID ? 'page' : undefined}
    onclick={onNavigate}
  >
    {OVERVIEW.label()}
  </a>

  {#each groups as group (group.id)}
    <div class="group">
      <p class="group-label" id="settings-group-{group.id}">{group.label()}</p>
      <ul aria-labelledby="settings-group-{group.id}">
        {#each group.items as item (item.id)}
          <li>
            <a
              class="item"
              class:active={activeId === item.id}
              href={item.href}
              aria-current={activeId === item.id ? 'page' : undefined}
              data-sveltekit-reload={leavesSettings(item.href) || undefined}
              onclick={onNavigate}
            >
              {item.label()}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  .settings-nav { display: flex; flex-direction: column; gap: var(--ds-space-md); font-family: var(--ds-font-sans); }
  .group { display: flex; flex-direction: column; gap: 0.15rem; }
  .group-label {
    margin: 0 0 0.15rem;
    padding: 0 0.6rem;
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-medium);
    color: var(--ds-color-muted);
  }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .item {
    display: block;
    padding: 0.4rem 0.6rem;
    border-radius: var(--ds-radius-sm);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    text-decoration: none;
    line-height: 1.35;
  }
  .item-top { font-weight: var(--ds-weight-medium); }
  .item:hover { background: var(--ds-color-accent-soft); }
  .item.active { color: var(--ds-color-accent); background: var(--ds-color-accent-soft); font-weight: var(--ds-weight-medium); }
</style>
