<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Edits a pending state: nothing applies until "Show N results", and closing
  // any other way drops the changes. /api/search-count counts the pending state
  // as the page would, so the button's number is the list's to be.
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { BottomSheet, Button, Checkbox, ChipInput, FormField, SegmentedControl, SegmentedControlItem, Select } from '$lib/design-system';
  import type { NodeClassOption } from '$lib/features/semantic';
  import { effectiveSort, searchHref, type SearchNamespaceOption, type SearchParams, type SearchSort } from '$lib/features/search';
  import { ALL, orNull, classPickerItems, typePickerItems, namespacePickerItems, sortItems } from './filterItems';
  import type { NodeType } from '$lib/features/nodes';

  let {
    open = $bindable(false),
    pending = $bindable(),
    applied,
    total,
    classOptions,
    tagOptions,
    namespaceOptions,
    onApply,
  }: {
    open?: boolean;
    /** The sheet's own copy of the state, edited until applied. */
    pending: SearchParams;
    /** What the list shows now — the pending state's starting point. */
    applied: SearchParams;
    /** The list's total, which is the count while nothing has changed. */
    total: number;
    classOptions: NodeClassOption[];
    tagOptions: string[];
    namespaceOptions: SearchNamespaceOption[];
    onApply: (next: SearchParams) => void;
  } = $props();

  const classes = $derived(classPickerItems(classOptions));
  const namespaces = $derived(namespacePickerItems(namespaceOptions));
  const sorts = $derived(sortItems(!!pending.q));

  // Not the sort or the view: a change of order alone fetches nothing.
  const countKey = (p: SearchParams) => searchHref({ q: p.q, class: p.class, exact: p.exact, tags: p.tags, type: p.type, namespace: p.namespace });

  // The last count stays while a newer one is on its way, so the button never
  // blanks or blocks.
  let counted = $state<{ key: string; total: number } | null>(null);
  const pendingKey = $derived(countKey(pending));
  const shown = $derived(pendingKey === countKey(applied) ? total : (counted?.total ?? null));

  $effect(() => {
    if (!open) return;
    const key = pendingKey;
    if (key === countKey(applied) || counted?.key === key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-count${key.slice('/search'.length)}`, { signal: controller.signal });
        if (res.ok) counted = { key, total: ((await res.json()) as { total: number }).total };
      } catch {
        // Aborted by a newer change, or offline: the last count stays.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  const applyLabel = $derived(
    shown === null
      ? m.search_page_sheet_apply()
      : new Intl.PluralRules(getLocale()).select(shown) === 'one'
        ? m.search_page_sheet_apply_one({ count: shown })
        : m.search_page_sheet_apply_other({ count: shown })
  );

  // Reset clears the filters; the term, the order and the view stay.
  function reset() {
    pending = { ...pending, class: null, exact: false, tags: [], type: null, namespace: null };
  }
</script>

<BottomSheet bind:open title={m.search_page_sheet_title()}>
  <div class="sf-rows">
    <FormField label={m.search_page_filter_class()}>
      <Select
        items={classes}
        value={pending.class ?? ALL}
        onValueChange={(v) => (pending = { ...pending, class: orNull(v), exact: orNull(v) ? pending.exact : false })}
        width="full"
      />
    </FormField>
    {#if pending.class}
      <Checkbox checked={!pending.exact} onCheckedChange={(v) => (pending = { ...pending, exact: !v })}>{m.search_page_sheet_subclasses()}</Checkbox>
    {/if}
    <FormField label={m.search_page_filter_tags()}>
      <ChipInput
        value={pending.tags}
        onValueChange={(tags) => (pending = { ...pending, tags })}
        suggestions={tagOptions}
        placeholder={m.search_page_filter_tags_placeholder()}
        removeLabel={m.search_page_tag_remove()}
      />
    </FormField>
    <FormField label={m.search_page_filter_type()} group>
      <SegmentedControl type="single" stretch value={pending.type ?? ALL} ariaLabel={m.search_page_filter_type()}>
        {#each typePickerItems() as item (item.value)}
          <SegmentedControlItem value={item.value} onclick={() => (pending = { ...pending, type: orNull<NodeType>(item.value) })}>{item.label}</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FormField>
    <FormField label={m.search_page_filter_namespace()}>
      <Select items={namespaces} value={pending.namespace ?? ALL} onValueChange={(v) => (pending = { ...pending, namespace: orNull(v) })} width="full" />
    </FormField>
    <FormField label={m.search_page_sort()}>
      <Select items={sorts} value={effectiveSort(pending)} onValueChange={(v) => (pending = { ...pending, sort: v as SearchSort })} width="full" />
    </FormField>
    <FormField label={m.search_page_view()} group>
      <SegmentedControl type="single" stretch value={pending.view} ariaLabel={m.search_page_view()}>
        <SegmentedControlItem value="list" onclick={() => (pending = { ...pending, view: 'list' })}>{m.search_page_view_list()}</SegmentedControlItem>
        <SegmentedControlItem value="grid" onclick={() => (pending = { ...pending, view: 'grid' })}>{m.search_page_view_grid()}</SegmentedControlItem>
      </SegmentedControl>
    </FormField>
  </div>
  {#snippet footer()}
    <Button onclick={reset}>{m.search_page_sheet_reset()}</Button>
    <Button variant="primary" class="sf-apply" onclick={() => onApply(pending)}>{applyLabel}</Button>
  {/snippet}
</BottomSheet>

<style>
  .sf-rows { display: flex; flex-direction: column; gap: var(--ds-space-md); padding: var(--ds-space-sm) 0; }
  :global(.sf-apply) { flex: 1 1 auto; }
</style>
