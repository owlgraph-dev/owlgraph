<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A chip's × and a sort or view change apply at once; the filter sheet applies
  // on its own confirm.
  import { tick, untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { BottomSheet, BottomSheetItem, Button, Chip } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import type { NodeClassOption } from '$lib/features/semantic';
  import { effectiveSort, type SearchNamespaceOption, type SearchParams } from '$lib/features/search';
  import { activeFilters } from './activeFilters';
  import { sortItems } from './filterItems';
  import SearchFilterSheet from './SearchFilterSheet.svelte';

  let {
    applied,
    total,
    classLabel,
    namespaceName,
    classOptions,
    tagOptions,
    namespaceOptions,
    go,
  }: {
    applied: SearchParams;
    total: number;
    classLabel: string | null;
    namespaceName: string | null;
    classOptions: NodeClassOption[];
    tagOptions: string[];
    namespaceOptions: SearchNamespaceOption[];
    go: (change: Partial<SearchParams>) => Promise<void>;
  } = $props();

  const chips = $derived(activeFilters(applied, { classLabel, namespaceName }));
  const sorts = $derived(sortItems(!!applied.q));
  const currentSort = $derived(effectiveSort(applied));
  const sortLabel = $derived(sorts.find((s) => s.value === currentSort)?.label ?? '');
  const sortButtonLabel = $derived(m.search_page_sort_button({ sort: sortLabel }));
  const viewButtonLabel = $derived(applied.view === 'grid' ? m.search_page_view_as_list() : m.search_page_view_as_grid());

  // The sheet's pending state, snapshotted in the click so its first render holds it.
  let filterOpen = $state(false);
  let pending = $state<SearchParams>(untrack(() => ({ ...applied, tags: [...applied.tags] })));
  function openFilters() {
    pending = { ...applied, tags: [...applied.tags] };
    filterOpen = true;
  }
  function apply(next: SearchParams) {
    filterOpen = false;
    go({ ...next, page: 1 });
  }

  let sortOpen = $state(false);
  let row = $state<HTMLElement | null>(null);

  // Removing a chip takes its button: focus moves to the chip in its place, or
  // to the Filter button when none is left.
  async function removeChip(index: number) {
    await go(chips[index].remove);
    await tick();
    const removes = row?.querySelectorAll<HTMLElement>('.sc-chips button') ?? [];
    const next = removes.length ? removes[Math.min(index, removes.length - 1)] : row?.querySelector<HTMLElement>('[data-filter-button]');
    next?.focus();
  }
</script>

<div class="sc-row" bind:this={row}>
  <Button aria-haspopup="dialog" data-filter-button onclick={openFilters}>
    <Icon name="sliders" size={16} />{chips.length ? m.search_page_filter_button_count({ count: chips.length }) : m.search_page_filter_button()}
  </Button>
  {#if chips.length}
    <ul class="sc-chips scroll-cue" aria-label={m.search_page_active_filters()}>
      {#each chips as chip, i (chip.key)}
        <li><Chip label={chip.label} removeLabel={m.search_page_chip_remove()} onRemove={() => removeChip(i)} /></li>
      {/each}
    </ul>
  {:else}
    <span class="sc-spacer"></span>
  {/if}
  <Button icon aria-label={sortButtonLabel} title={sortButtonLabel} onclick={() => (sortOpen = true)}><Icon name="arrow-up-down" size={16} /></Button>
  <Button icon aria-label={viewButtonLabel} title={viewButtonLabel} onclick={() => go({ view: applied.view === 'grid' ? 'list' : 'grid', page: applied.page })}>
    <Icon name={applied.view === 'grid' ? 'list' : 'layout-grid'} size={16} />
  </Button>
</div>

<SearchFilterSheet bind:open={filterOpen} bind:pending {applied} {total} {classOptions} {tagOptions} {namespaceOptions} onApply={apply} />

<BottomSheet bind:open={sortOpen} title={m.search_page_sort()}>
  <div class="sc-sorts">
    {#each sorts as sort (sort.value)}
      <BottomSheetItem
        active={sort.value === currentSort}
        onclick={() => {
          sortOpen = false;
          go({ sort: sort.value });
        }}>{sort.label}</BottomSheetItem
      >
    {/each}
  </div>
</BottomSheet>

<style>
  .sc-row { display: flex; align-items: center; gap: var(--ds-space-sm); min-width: 0; }
  /* Scrolls sideways inside the row, never the page; a control's height, so a
     chip's touch-sized remove button can't make it scroll vertically too.
     Basis 0: it takes what the buttons leave and never squeezes them. */
  .sc-chips {
    flex: 1 1 0;
    min-width: 0;
    align-self: stretch;
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    height: var(--ds-control-h-md);
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .sc-chips li { flex: none; }
  .sc-spacer { flex: 1 1 0; }
  .sc-sorts { display: flex; flex-direction: column; }
</style>
