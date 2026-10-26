<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The URL is the only state (docs/architecture/search.md): every control navigates to a new
  // URL, so a filter set is a link and Back steps through the filters tried. The
  // inline row and the compact row show the one state; CSS picks one.
  import { afterNavigate, goto } from '$app/navigation';
  import { navigating } from '$app/stores';
  import * as m from '$lib/paraglide/messages';
  import { Button, ChipInput, EmptyState, Pagination, SearchField, SegmentedControl, SegmentedControlItem, Select } from '$lib/design-system';
  import type { NodeClassOption } from '$lib/features/semantic';
  import { effectiveSort, searchHref, type SearchNamespaceOption, type SearchParams, type SearchResultCard as Result, type SearchSort } from '$lib/features/search';
  import SearchResultCard from './SearchResultCard.svelte';
  import SearchCompactRow from './SearchCompactRow.svelte';
  import { countLine } from './countLine';
  import { ALL, orNull, classPickerItems, matchItems, typePickerItems, namespacePickerItems, sortItems } from './filterItems';
  import type { NodeType } from '$lib/features/nodes';

  interface SearchPageData {
    applied: SearchParams;
    results: Result[];
    total: number;
    pageCount: number;
    classLabel: string | null;
    namespaceName: string | null;
    classOptions: NodeClassOption[];
    tagOptions: string[];
    namespaces: SearchNamespaceOption[];
  }

  let { data }: { data: SearchPageData } = $props();

  const applied = $derived(data.applied);

  // Follows the URL until the reader edits it; applies on submit.
  let draft = $derived(data.applied.q);

  const classes = $derived(classPickerItems(data.classOptions));
  const namespaces = $derived(namespacePickerItems(data.namespaces));
  const sorts = $derived(sortItems(!!applied.q));

  const count = $derived(countLine({ total: data.total, applied, classLabel: data.classLabel, namespaceName: data.namespaceName }));
  const filtered = $derived(!!(applied.q || applied.class || applied.tags.length || applied.type || applied.namespace));
  const busy = $derived($navigating?.to?.route.id === '/search');

  // A change of filter starts over at the first page; the view keeps it.
  function go(change: Partial<SearchParams>) {
    return goto(searchHref({ ...applied, page: 1, ...change }), { keepFocus: true, noScroll: true });
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    go({ q: draft });
  }

  // `go` skips SvelteKit's scroll reset, so a new page of results scrolls the
  // count line into view here and moves focus there, where the new page begins.
  let countEl = $state<HTMLElement | null>(null);
  afterNavigate(({ from, to }) => {
    if (!from || !to || from.url.pathname !== to.url.pathname) return;
    if (from.url.searchParams.get('page') === to.url.searchParams.get('page')) return;
    countEl?.scrollIntoView({ block: 'start' });
    countEl?.focus({ preventScroll: true });
  });
</script>

<svelte:head>
  <title>{m.search_page_title()}</title>
  <!-- Every filter combination is a URL, an endless space for a crawler; the
       content is indexed at its own address. -->
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="sp">
  <h1 class="sp-title">{m.search_page_title()}</h1>

  <form class="sp-form" role="search" method="get" action="/search" onsubmit={submit}>
    <SearchField name="q" bind:value={draft} placeholder={m.search_page_field_placeholder()} ariaLabel={m.search_page_field_label()} submitLabel={m.search_page_submit()} />

    <div class="sp-filters sp-inline" role="group" aria-label={m.search_page_filters_label()}>
      <Select items={classes} value={applied.class ?? ALL} onValueChange={(v) => go({ class: orNull(v), exact: false })} ariaLabel={m.search_page_filter_class()} />
      {#if applied.class}
        <Select items={matchItems()} value={applied.exact ? 'exact' : 'is-a'} onValueChange={(v) => go({ exact: v === 'exact' })} ariaLabel={m.search_page_class_match_aria()} />
      {/if}
      <div class="sp-tags">
        <ChipInput
          value={applied.tags}
          onValueChange={(tags) => go({ tags })}
          suggestions={data.tagOptions}
          placeholder={m.search_page_filter_tags_placeholder()}
          ariaLabel={m.search_page_filter_tags()}
          removeLabel={m.search_page_tag_remove()}
        />
      </div>
      <Select items={typePickerItems()} value={applied.type ?? ALL} onValueChange={(v) => go({ type: orNull<NodeType>(v) })} ariaLabel={m.search_page_filter_type()} />
      <Select items={namespaces} value={applied.namespace ?? ALL} onValueChange={(v) => go({ namespace: orNull(v) })} ariaLabel={m.search_page_filter_namespace()} />
      <Select items={sorts} value={effectiveSort(applied)} onValueChange={(v) => go({ sort: v as SearchSort })} ariaLabel={m.search_page_sort()} />
      <SegmentedControl type="single" value={applied.view} ariaLabel={m.search_page_view()}>
        <SegmentedControlItem value="list" onclick={() => go({ view: 'list', page: applied.page })}>{m.search_page_view_list()}</SegmentedControlItem>
        <SegmentedControlItem value="grid" onclick={() => go({ view: 'grid', page: applied.page })}>{m.search_page_view_grid()}</SegmentedControlItem>
      </SegmentedControl>
    </div>

    <div class="sp-compact">
      <SearchCompactRow
        {applied}
        total={data.total}
        classLabel={data.classLabel}
        namespaceName={data.namespaceName}
        classOptions={data.classOptions}
        tagOptions={data.tagOptions}
        namespaceOptions={data.namespaces}
        {go}
      />
    </div>
  </form>

  <p class="sp-count" role="status" tabindex="-1" bind:this={countEl} data-testid="search-count">{count}</p>

  {#if data.results.length}
    <ol class="sp-results" class:sp-grid={applied.view === 'grid'} aria-label={m.search_page_results_aria()} aria-busy={busy || undefined}>
      {#each data.results as result (result.id)}
        <SearchResultCard {result} clamp={applied.view === 'grid'} />
      {/each}
    </ol>
    {#if data.pageCount > 1}
      <div class="sp-pages">
        <p class="sp-page-of">{m.search_page_page_of({ page: applied.page, count: data.pageCount })}</p>
        <Pagination
          page={applied.page}
          pageCount={data.pageCount}
          href={(page) => searchHref({ ...applied, page })}
          ariaLabel={m.search_page_pagination_aria()}
          previousLabel={m.search_page_previous()}
          nextLabel={m.search_page_next()}
          pageLabel={(page) => m.search_page_page_label({ page })}
        />
      </div>
    {/if}
  {:else}
    <EmptyState layout="centered">
      {filtered ? m.search_page_empty() : m.search_page_empty_nothing()}
      {#snippet actions()}
        {#if filtered}
          <Button size="sm" href={searchHref({ view: applied.view })}>{m.search_page_reset()}</Button>
        {/if}
      {/snippet}
    </EmptyState>
  {/if}
</div>

<style>
  .sp { display: flex; flex-direction: column; gap: var(--ds-space-md); min-width: 0; }
  .sp-title { margin: 0; font-size: 1.35rem; font-weight: var(--ds-weight-semibold); letter-spacing: -0.01em; line-height: 1.25; }
  .sp-form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .sp-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); min-width: 0; }
  /* The compact row in the compact chrome (COMPACT_CHROME_MEDIA) and on a sideways phone. */
  .sp-compact { display: none; }
  @media (max-width: 768px), (pointer: coarse) and (max-height: 500px) {
    .sp-inline { display: none; }
    .sp-compact { display: block; min-width: 0; }
  }
  .sp-tags { flex: 1 1 14rem; min-width: min(14rem, 100%); }
  .sp-count { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .sp-results { display: flex; flex-direction: column; gap: var(--ds-space-md); margin: 0; padding: 0; list-style: none; }
  .sp-results[aria-busy='true'] { opacity: var(--ds-opacity-disabled); }
  /* A row's cards stretch to the tallest, each pinning its foot to the bottom,
     so a row ends evenly. */
  .sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr)); }
  .sp-pages { display: flex; flex-direction: column; align-items: center; gap: var(--ds-space-sm); }
  .sp-page-of { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
