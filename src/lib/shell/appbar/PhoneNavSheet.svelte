<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The phone's counterpart of the desktop-only NavigationMenu: the same tree
  // as expandable sheet rows.
  import { BottomSheetItem } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import type { ResolvedTreeNode } from '$lib/features/site';

  let {
    navEntries,
    path,
    reload = false,
    onNavigate,
  }: {
    navEntries: ResolvedTreeNode[];
    path: string;
    /** Each link loads its page anew (AccountMenu's reloadLinks). */
    reload?: boolean;
    onNavigate: () => void;
  } = $props();

  let expanded = $state(new Set<string>());

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }
</script>

<div class="menu-nav">
  {#each navEntries as entry (entry.id)}
    {#if entry.kind === 'link'}
      <BottomSheetItem
        href={entry.href}
        active={!entry.external && path === entry.href}
        target={entry.external ? '_blank' : undefined}
        rel={entry.external ? 'noopener' : undefined}
        data-sveltekit-reload={reload ? '' : undefined}
        onclick={onNavigate}
      >
        {entry.label}
      </BottomSheetItem>
    {:else}
      <BottomSheetItem aria-expanded={expanded.has(entry.id)} onclick={() => toggle(entry.id)}>
        {entry.label}
        {#snippet trailing()}
          <span class="sheet-group-chevron" class:sheet-group-chevron-open={expanded.has(entry.id)}><Icon name="chevron" size={16} /></span>
        {/snippet}
      </BottomSheetItem>
      {#if expanded.has(entry.id)}
        <div class="sheet-group-children">
          {#each entry.children as child (child.id)}
            <BottomSheetItem
              href={child.href}
              active={!child.external && path === child.href}
              target={child.external ? '_blank' : undefined}
              rel={child.external ? 'noopener' : undefined}
              data-sveltekit-reload={reload ? '' : undefined}
              onclick={onNavigate}
            >
              {child.label}
            </BottomSheetItem>
          {/each}
        </div>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .menu-nav { display: flex; flex-direction: column; }
  .sheet-group-chevron { display: inline-flex; transition: transform 0.15s ease; }
  .sheet-group-chevron-open { transform: rotate(180deg); }
  .sheet-group-children { display: flex; flex-direction: column; padding-left: 1rem; }
</style>
