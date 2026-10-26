<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits UI's Dialog directly: design-system/Dialog.svelte's centered sizes don't
  // fit a top-anchored overlay that goes full-screen on a phone. Command, not
  // Combobox, which anchors to a trigger. The search runs on the server
  // (shouldFilter={false}), debounced.
  import { goto } from '$app/navigation';
  import { crossesStylePolicy } from '$lib/platform/csp';
  import { lockBodyScroll } from '$lib/design-system/scrollLock';
  import { Dialog as BitsDialog, Command as BitsCommand } from 'bits-ui';
  import { Command, CommandInput, CommandItem, SegmentedControl, SegmentedControlItem, EmptyState, Button, Badge } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { parseSnippet } from '../searchSnippet';
  import { searchOverlayOpen } from '../searchOverlayStore';
  import { searchHref } from '../searchUrl';
  import * as m from '$lib/paraglide/messages';
  import type { NodeType } from '$lib/features/nodes';

  type Result = { id: string; type: NodeType; title: string; url: string; snippet: string };
  // Collections come with All; the search page narrows to them.
  type FilterType = Exclude<NodeType, 'collection'>;

  const TYPE_FILTER_OPTS: ['all' | FilterType, () => string][] = [
    ['all', m.search_filter_all],
    ['page', m.search_filter_pages],
    ['document', m.search_filter_documents]
  ];

  let q = $state('');
  let results = $state<Result[]>([]);
  let loading = $state(false);
  let selectedValue = $state('');
  let selectedType = $state<'all' | FilterType>('all');
  let timer: ReturnType<typeof setTimeout>;
  let requestId = 0; // guards against a stale response clobbering a newer one
  // The trailing item that hands the term over to the search page.
  const ALL_RESULTS = '__all';

  function close() {
    searchOverlayOpen.set(false);
  }

  // Reset on every open; focus comes from CommandInput's own `autofocus`.
  $effect(() => {
    if ($searchOverlayOpen) {
      q = '';
      results = [];
      loading = false;
      selectedValue = '';
      selectedType = 'all';
    }
  });
  // The page stops scrolling while the overlay is open (see the Content below).
  $effect(() => {
    if ($searchOverlayOpen) return lockBodyScroll();
  });

  async function runSearch(term: string) {
    const myRequestId = ++requestId;
    loading = true;
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query:
            'query Search($text:String!,$types:[NodeType!]){search(text:$text,types:$types){id type title url snippet}}',
          variables: { text: term, types: selectedType === 'all' ? null : [selectedType] }
        })
      });
      if (myRequestId !== requestId) return; // superseded by a newer request
      if (res.ok) results = (await res.json()).data?.search ?? [];
      // Enter opens the first result; with none, it hands over to the page.
      selectedValue = results.length ? `${results[0].type}:${results[0].id}` : ALL_RESULTS;
    } catch {
      /* ignore transient search errors */
    } finally {
      if (myRequestId === requestId) loading = false;
    }
  }

  function onInput() {
    clearTimeout(timer);
    const term = q.trim();
    if (!term) {
      results = [];
      loading = false;
      selectedValue = '';
      return;
    }
    timer = setTimeout(() => runSearch(term), 120);
  }

  function onTypeChange(type: 'all' | FilterType) {
    selectedType = type;
    clearTimeout(timer);
    const term = q.trim();
    if (term) runSearch(term);
  }

  function gotoResult(url: string) {
    close();
    // A result under the other style-src class is a full navigation: the policy
    // belongs to the document, not the route (platform/csp.ts).
    if (crossesStylePolicy(window.location.pathname, url)) window.location.assign(url);
    else goto(url);
  }

  // The overlay is the quick jump; the search page browses everything, with the
  // term and the type filter carried over.
  const searchPageHref = $derived(searchHref({ q: q.trim(), type: selectedType === 'all' ? null : selectedType }));
  function showAllResults() {
    gotoResult(searchPageHref);
  }
  // A modified click is the browser's: a new tab keeps the overlay as it is.
  function onSearchPageClick(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    gotoResult(searchPageHref);
  }

  function resultTypeLabel(type: Result['type']) {
    if (type === 'collection') return m.search_result_type_collection();
    return type === 'page' ? m.search_result_type_page() : m.search_result_type_document();
  }
</script>

{#snippet allResults()}
  <CommandItem value={ALL_RESULTS} onSelect={showAllResults}>
    <span class="rall">{m.search_all_results()}<Icon name="arrow-right" size={14} /></span>
  </CommandItem>
{/snippet}

<BitsDialog.Root open={$searchOverlayOpen} onOpenChange={(v) => searchOverlayOpen.set(v)}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="search-backdrop" />
    <!-- The app's own scroll lock (design-system/scrollLock.ts): Bits UI's
         release writes a style attribute a strict style-src blocks. -->
    <BitsDialog.Content class="search-overlay" preventScroll={false}>
      <!-- Visually hidden: the dialog's accessible name. -->
      <BitsDialog.Title class="search-title-sr">{m.search_dialog_title()}</BitsDialog.Title>
      <Command bind:value={selectedValue} shouldFilter={false} vimBindings={false} ariaLabel={m.search_dialog_title()} class="search-command">
        <div class="search-bar">
          <Icon name="search" size={18} />
          <CommandInput bind:value={q} oninput={onInput} placeholder={m.search_placeholder()} autofocus class="search-input" />
          <Button variant="ghost" size="sm" icon onclick={close} aria-label={m.search_close_aria()} title={m.search_close_aria()}><Icon name="x" size={16} /></Button>
        </div>

        <div class="search-filters scroll-cue">
          <SegmentedControl
            type="single"
            value={selectedType}
            ariaLabel={m.search_filter_aria_label()}
            onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
          >
            {#each TYPE_FILTER_OPTS as [key, label] (key)}
              <SegmentedControlItem value={key} onclick={() => onTypeChange(key)}>{label()}</SegmentedControlItem>
            {/each}
          </SegmentedControl>
        </div>

        {#if !q.trim()}
          <EmptyState layout="centered">{m.search_hint_empty()}</EmptyState>
        {:else if loading}
          <EmptyState layout="centered" live>{m.search_hint_loading()}</EmptyState>
        {:else if results.length}
          <BitsCommand.List class="results">
            {#each results as r (r.type + ':' + r.id)}
              <CommandItem value={r.type + ':' + r.id} onSelect={() => gotoResult(r.url)}>
                <span class="rtop"><Badge tone={r.type === 'document' ? 'info' : 'accent'}>{resultTypeLabel(r.type)}</Badge><span class="rtitle">{r.title}</span></span>
                {#if r.snippet}
                  <span class="rsnippet"
                    >{#each parseSnippet(r.snippet) as part}{#if part.hl}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}</span
                  >
                {/if}
              </CommandItem>
            {/each}
            {@render allResults()}
          </BitsCommand.List>
        {:else}
          <EmptyState layout="centered" live>
            {#if selectedType === 'page'}{m.search_no_results_pages({ q: q.trim() })}
            {:else if selectedType === 'document'}{m.search_no_results_documents({ q: q.trim() })}
            {:else}{m.search_no_results({ q: q.trim() })}{/if}
          </EmptyState>
          <BitsCommand.List class="results">{@render allResults()}</BitsCommand.List>
        {/if}
      </Command>
      <div class="search-footer">
        <Button variant="ghost" size="sm" href={searchPageHref} onclick={onSearchPageClick}>
          <Icon name="sliders" size={14} />{m.search_advanced()}<Icon name="arrow-right" size={14} />
        </Button>
      </div>
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  :global(.search-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--ds-color-scrim);
  }
  :global(.search-overlay) {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 201;
    width: min(640px, 90vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--ds-color-raised-modal);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-lg);
    overflow: hidden;
  }
  :global(.search-title-sr) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  :global(.search-overlay .ds-command) {
    flex: 1;
    min-height: 0;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem 1rem;
    color: var(--ds-color-muted);
    border-bottom: 1px solid var(--ds-color-border);
    flex: none;
    /* Rounded like the dialog, or the focus ring is square here and clipped. */
    border-radius: var(--ds-radius-md) var(--ds-radius-md) 0 0;
  }
  /* The bar is the visible control, so it takes the input's ring. :has(), not
     :focus-within, which would light the bar for the close button too.
     :global() because .search-input lands in CommandInput's template. */
  :global(.search-bar:has(.search-input:focus-visible)) {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  /* Or the input draws a second ring inside the bar's. */
  :global(.search-bar .search-input:focus-visible) { outline: none; }

  .search-filters {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--ds-color-border);
    overflow-x: auto;
    flex: none;
  }


  /* The way to the search page, in every state and above a phone's keyboard. */
  .search-footer {
    display: flex;
    align-items: center;
    padding: 0.4rem 0.75rem;
    border-top: 1px solid var(--ds-color-border);
    flex: none;
  }

  :global(.search-overlay .results) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.4rem;
  }
  .rtop { display: flex; align-items: center; gap: 0.55rem; }
  .rtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rall { display: inline-flex; align-items: center; gap: var(--ds-space-sm); color: var(--ds-color-link); font-weight: var(--ds-weight-medium); }
  .rsnippet {
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--ds-color-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .rsnippet :global(mark) { background: var(--ds-color-accent-soft); color: inherit; border-radius: 2px; padding: 0 1px; }

  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    :global(.search-overlay) {
      top: 0;
      left: 0;
      right: 0;
      transform: none;
      width: auto;
      /* Down to the on-screen keyboard, so the results scroll above it. */
      bottom: var(--ds-keyboard-inset, 0px);
      max-height: none;
      height: auto;
      border-radius: 0;
      border: 0;
    }
    /* Full-bleed here, so the bar has no dialog curve to follow. */
    .search-bar { border-radius: 0; }
  }
</style>
