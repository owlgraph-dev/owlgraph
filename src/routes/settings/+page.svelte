<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The overview: the sidebar's filtered tree, a list per group.
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { SETTINGS_TREE } from '$lib/shell/settings/tree';
  import { leavesSettings, visibleTree } from '$lib/shell/settings/treeModel';
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();
  const groups = $derived(visibleTree(SETTINGS_TREE, new Set(data.permissions)));
</script>

<SettingsPageHead title={m.settings_overview()} intro={m.settings_overview_intro()} />

{#each groups as group (group.id)}
  <section class="group">
    <h2>{group.label()}</h2>
    <ul>
      {#each group.items as item (item.id)}
        <li>
          <a href={item.href} data-sveltekit-reload={leavesSettings(item.href) || undefined}>
            <span class="label">{item.label()}</span>
            <span class="desc">{item.description()}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/each}

<style>
  .group { margin: 0 0 2rem; }
  h2 { margin: 0 0 0.35rem; font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); }
  ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--ds-color-border); }
  li { border-bottom: 1px solid var(--ds-color-border); }
  a {
    display: grid;
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
    gap: 0.25rem 2rem;
    padding: 0.85rem 0.5rem;
    margin: 0 -0.5rem;
    border-radius: var(--ds-radius-sm);
    color: inherit;
    text-decoration: none;
  }
  /* An affordance, not the focus indicator: app.css's ring stays on top. */
  a:hover, a:focus-visible { background: var(--ds-color-accent-soft); }
  a:hover .label { color: var(--ds-color-accent); }
  .label { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); }
  .desc { font-size: var(--ds-text-sm); color: var(--ds-color-muted); line-height: 1.5; }
  @container (max-width: 560px) {
    a { grid-template-columns: minmax(0, 1fr); }
  }
</style>
