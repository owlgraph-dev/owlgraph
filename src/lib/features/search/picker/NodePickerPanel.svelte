<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Matches titles, not text: a picker, not the search page (docs/architecture/search.md,
  // "The node picker"). Whether a row can be picked is the consumer's (`mark`).
  // A new document's form opens in this same surface, never a dialog over a
  // dialog. Creation is offered to an editor; the server is the guard.
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import {
    Alert,
    Button,
    Command,
    CommandItem,
    CommandList,
    CommandSearch,
    EmptyState,
    SegmentedControl,
    SegmentedControlItem,
    Spinner,
  } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { canEdit } from '$lib/features/auth';
  import { NODE_TYPE_GLYPH, NODE_TYPE_LABEL, nodePath, type NodeType } from '$lib/features/nodes';
  import { searchNodes } from '../client';
  import type { NodeSearchResult } from '../types';
  import { createBlankPageViaApi } from '$lib/features/pages';
  import { createCuratedCollection } from '$lib/features/collections';
  import type { DocumentSource } from '$lib/features/documents';
  import { NewDocumentForm } from '$lib/features/documents/create';
  import { appendPage, createRowTypes, scopeTypes, type NodeMark, type NodePickerCreate, type NodePickerScope, type PickerRow } from './nodePicker';

  let {
    title,
    placeholder,
    types,
    scope: offerScope = true,
    exclude,
    mark,
    rowAction,
    create,
    recent,
    leading,
    note,
    meta = 'kind',
    size = 'lg',
    autofocus = true,
    hints = true,
    onPick,
  }: {
    /** The picker's name: the Command's accessible name (and its host's title). */
    title: string;
    placeholder: string;
    types: readonly NodeType[];
    /** Scope chips (All · Pages · …) when it offers more than one type. */
    scope?: boolean;
    /** Never offered — a collection to itself. Left out by the server, so pages stay full. */
    exclude?: ReadonlySet<string>;
    /** What a row says beside its title, and whether it cannot be picked. */
    mark?: (node: NodeSearchResult) => NodeMark | null;
    /** What Enter does on a row: "Add", "Embed as its integration's block". */
    rowAction: string | ((node: NodeSearchResult) => string);
    /** The types it may make, and the namespace they go into. */
    create?: NodePickerCreate;
    /** Before a term is typed: this many of the nodes the viewer worked on last. */
    recent?: number;
    /** Rows of the caller's own before the matches, for the term typed. */
    leading?: (term: string) => PickerRow[];
    /** A line of guidance under the list ("Select text first to link it"). */
    note?: string;
    /** A row's second line: what the node is and where it sits (`kind`), or its address (`address` — where a nav entry goes). */
    meta?: 'kind' | 'address';
    /** `lg` a dialog's or a sheet's, `md` a popover's, `sm` inline in a form (no height of its own, the list capped). */
    size?: 'sm' | 'md' | 'lg';
    /** The search field takes the focus as it opens — not inline in a form, where nothing opened it. */
    autofocus?: boolean;
    /** The keyboard hints in the footer — not on a phone. */
    hints?: boolean;
    /** A node picked — or made and picked. The host closes. */
    onPick: (node: NodeSearchResult) => void;
  } = $props();

  const scopeLabel: Record<NodeType, () => string> = {
    page: m.node_picker_scope_page,
    document: m.node_picker_scope_document,
    collection: m.node_picker_scope_collection,
  };
  const newLabel: Record<NodeType, (input: { title: string }) => string> = {
    page: m.node_picker_new_page,
    document: m.node_picker_new_document,
    collection: m.node_picker_new_collection,
  };

  const uid = $props.id();
  const docFormId = `${uid}-new-document`;

  let query = $state('');
  let scope = $state<NodePickerScope>('all');
  let results = $state<NodeSearchResult[]>([]);
  let more = $state(false);
  let exact = $state<NodeType[]>([]);
  /** idle: nothing typed · loading: an answer on its way · recent: the viewer's last nodes (nothing typed) · done: a term's matches · failed */
  let status = $state<'idle' | 'loading' | 'recent' | 'done' | 'failed'>('idle');
  let loadingMore = $state(false);
  /** The highlighted row's value (Bits UI's): a node's id, or `create:<type>`. */
  let highlighted = $state('');

  let step = $state<'list' | 'document'>('list');
  let creating = $state<NodeType | null>(null);
  let createFailed = $state(false);
  let docBusy = $state(false);
  let docSource = $state<DocumentSource>('upload');
  let stepEl = $state<HTMLElement | null>(null);

  const scopes = $derived(offerScope && types.length > 1 ? types : []);
  const term = $derived(query.trim());
  const leadRows = $derived(leading?.(term) ?? []);
  const canCreate = $derived(!!create && canEdit(page.data.user as Parameters<typeof canEdit>[0]));
  // Only once the term's own answer is in: until then an exact title isn't known.
  const createTypes = $derived(
    status === 'done' ? createRowTypes({ query: term, scope, types, create: create?.types ?? null, exact, canCreate }) : []
  );
  const actionOf = (node: NodeSearchResult) => (typeof rowAction === 'string' ? rowAction : rowAction(node));
  const highlightedAction = $derived.by(() => {
    if (highlighted.startsWith('create:')) return m.create_modal_create();
    const lead = leadRows.find((r) => `lead:${r.value}` === highlighted);
    if (lead) return lead.action;
    const node = results.find((r) => r.id === highlighted);
    return node ? actionOf(node) : typeof rowAction === 'string' ? rowAction : '';
  });
  const summary = $derived(
    more
      ? m.node_picker_match_more({ query: term, count: results.length })
      : results.length === 1
        ? m.node_picker_match_one({ query: term, count: 1 })
        : m.node_picker_match_other({ query: term, count: results.length })
  );

  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(delay = 150) {
    clearTimeout(timer);
    const mine = ++seq;
    createFailed = false;
    if (!term && !recent) {
      results = [];
      more = false;
      exact = [];
      status = 'idle';
      return;
    }
    status = 'loading';
    const asked = term;
    timer = setTimeout(() => void load(mine, asked, false), delay);
  }

  async function load(mine: number, asked: string, append: boolean) {
    const answer = asked
      ? await searchNodes(asked, { types: scopeTypes(scope, types), offset: append ? results.length : 0, exclude })
      : await searchNodes('', { types: scopeTypes(scope, types), limit: recent, exclude, recent: true });
    if (mine !== seq) return;
    loadingMore = false;
    if (!answer) {
      status = 'failed';
      return;
    }
    results = append ? appendPage(results, answer.results) : answer.results;
    more = asked ? answer.more : false;
    exact = answer.exact;
    status = asked ? 'done' : 'recent';
  }

  onMount(() => {
    if (recent) schedule(0);
  });

  // The item's own click (Enter and Space included), as SegmentedControlItem asks.
  function setScope(next: NodePickerScope) {
    if (next === scope) return;
    scope = next;
    schedule(0);
  }

  // Only once the term's own answer is in: a page further is a page of it.
  function showMore() {
    if (loadingMore || !more || status !== 'done') return;
    loadingMore = true;
    void load(++seq, term, true);
  }

  $effect(() => () => clearTimeout(timer));

  function pick(node: NodeSearchResult) {
    if (mark?.(node)?.disabled) return;
    onPick(node);
  }

  function made(type: NodeType, id: string, slug: string, namespaceSlug: string | null, madeTitle: string): NodeSearchResult {
    return { type, id, title: madeTitle, slug, href: nodePath(namespaceSlug, slug), namespace: create?.namespace.name ?? null, plugin: null, pluginLabel: null };
  }

  async function make(type: NodeType) {
    if (!create || creating) return;
    createFailed = false;
    if (type === 'document') {
      step = 'document';
      await tick();
      stepEl?.querySelector<HTMLElement>('[role="radio"], input, button')?.focus();
      return;
    }
    const namespace = create.namespace;
    const named = term;
    creating = type;
    let node: NodeSearchResult | null = null;
    try {
      const res = type === 'page' ? await createBlankPageViaApi(namespace.id, named) : await createCuratedCollection(namespace.id, named);
      if (res.ok) node = made(type, res.id, res.slug, res.namespaceSlug, named);
    } catch {
      node = null;
    }
    creating = null;
    if (node) onPick(node);
    else createFailed = true;
  }

  function back() {
    step = 'list';
  }
</script>

{#snippet glyph(name: string)}
  <span class="np-glyph"><Icon {name} size={18} /></span>
{/snippet}

{#if step === 'list'}
  <div class="np np-{size}">
    <!-- Inline in a form, the first rows arriving must not scroll the page to them. -->
    <Command bind:value={highlighted} shouldFilter={false} vimBindings={false} disableInitialScroll={!autofocus} ariaLabel={title} class="np-command">
      <div class="np-head">
        <CommandSearch
          value={query}
          onValueChange={(v) => {
            query = v;
            schedule();
          }}
          {placeholder}
          clearLabel={m.node_picker_clear()}
          size={size === 'lg' ? 'lg' : 'md'}
          {autofocus}
        />
        {#if scopes.length > 1}
          <div class="np-scope">
            <SegmentedControl
              type="single"
              size="sm"
              value={scope}
              ariaLabel={m.node_picker_scope_label()}
              onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
            >
              <SegmentedControlItem value="all" onclick={() => setScope('all')}>{m.node_picker_scope_all()}</SegmentedControlItem>
              {#each scopes as type (type)}
                <SegmentedControlItem value={type} onclick={() => setScope(type)}>{scopeLabel[type]()}</SegmentedControlItem>
              {/each}
            </SegmentedControl>
          </div>
        {/if}
        {#if createFailed}<Alert tone="danger">{m.node_picker_create_failed()}</Alert>{/if}
      </div>

      <div class="np-results">
        {#if status === 'idle' || (status === 'recent' && results.length === 0)}
          <EmptyState size="sm">{m.node_picker_hint()}</EmptyState>
        {:else if status === 'loading' && term && results.length === 0 && leadRows.length === 0}
          <EmptyState size="sm" live>{m.node_picker_searching()}</EmptyState>
        {:else if status === 'failed'}
          <EmptyState size="sm" live>{m.node_picker_failed()}</EmptyState>
        {:else if status === 'done' && results.length === 0 && leadRows.length === 0}
          <EmptyState size="sm" live>{m.node_picker_none({ query: term })}</EmptyState>
        {:else if status === 'recent'}
          <p class="np-heading" id="{uid}-recent">{m.node_picker_recent()}</p>
        {/if}
        <CommandList ariaLabel={status === 'recent' ? m.node_picker_recent() : m.node_picker_results()}>
          {#each leadRows as row (row.value)}
            <CommandItem value="lead:{row.value}" onSelect={row.onSelect}>
              <span class="np-row">
                {@render glyph(row.glyph)}
                <span class="np-text">
                  <span class="np-title">{row.title}</span>
                  {#if row.meta}<span class="np-meta">{row.meta}</span>{/if}
                </span>
                {#if highlighted === `lead:${row.value}`}
                  <span class="np-action" aria-hidden="true">{row.action}{#if hints}&ensp;↵{/if}</span>
                {/if}
              </span>
            </CommandItem>
          {/each}
          {#each results as node (node.id)}
            {@const state = mark?.(node) ?? null}
            {@const second = meta === 'address' ? node.href : [types.length > 1 ? NODE_TYPE_LABEL[node.type]() : null, node.namespace, node.pluginLabel].filter(Boolean).join(' · ')}
            <CommandItem value={node.id} disabled={state?.disabled ?? false} onSelect={() => pick(node)}>
              <span class="np-row">
                {@render glyph(NODE_TYPE_GLYPH[node.type])}
                <span class="np-text">
                  <span class="np-title" class:np-marked={state}>{node.title}</span>
                  {#if second}<span class="np-meta">{second}</span>{/if}
                </span>
                {#if state}
                  <span class="np-note">{state.note}</span>
                {:else if highlighted === node.id}
                  <span class="np-action" aria-hidden="true">{actionOf(node)}{#if hints}&ensp;↵{/if}</span>
                {/if}
              </span>
            </CommandItem>
          {/each}
          {#each createTypes as type (type)}
            <CommandItem value="create:{type}" onSelect={() => void make(type)}>
              <span class="np-row">
                {@render glyph('plus')}
                <span class="np-text">
                  <span class="np-title">{newLabel[type]({ title: term })}</span>
                  <span class="np-meta">{m.node_picker_new_in({ namespace: create?.namespace.name ?? '' })}</span>
                </span>
                {#if creating === type}<Spinner size={16} />{/if}
              </span>
            </CommandItem>
          {/each}
        </CommandList>
      </div>

      {#if note}<p class="np-hint">{note}</p>{/if}
      {#if (status === 'done' && results.length > 0) || hints}
        <div class="np-foot">
          {#if status === 'done' && results.length > 0}
            <span class="np-summary" role="status">{summary}</span>
          {/if}
          {#if more && status === 'done'}
            <Button size="sm" variant="ghost" loading={loadingMore} onclick={showMore}>{m.node_picker_show_more()}</Button>
          {/if}
          {#if hints}
            <span class="np-keys" aria-hidden="true">{m.node_picker_keys({ action: highlightedAction })}</span>
          {/if}
        </div>
      {/if}
    </Command>
  </div>
{:else if create}
  <div class="np np-step" bind:this={stepEl}>
    <h3 class="np-step-title">{m.node_picker_new_document_heading()}</h3>
    <div class="np-step-body">
      <NewDocumentForm
        id={docFormId}
        namespaceId={create.namespace.id}
        initialTitle={term}
        bind:busy={docBusy}
        bind:source={docSource}
        onCreated={(doc) => onPick(made('document', doc.id, doc.slug, create?.namespace.slug ?? null, doc.title))}
      />
    </div>
    <div class="np-step-actions">
      <Button variant="secondary" onclick={back} disabled={docBusy}><Icon name="chevron-left" size={16} />{m.node_picker_back()}</Button>
      <Button type="submit" form={docFormId} variant="primary" loading={docBusy}>
        {docSource === 'link' ? m.create_modal_create() : m.create_modal_upload()}
      </Button>
    </div>
  </div>
{/if}

<style>
  /* Fills the host's body: head and foot stay, the results scroll. A preferred
     height, so the surface doesn't jump with each answer's length. */
  .np {
    flex: 1 1 auto;
    min-height: 0;
    height: 30rem;
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
  }
  .np-md { height: 24rem; }
  /* Inline: as tall as its content, the list capped. */
  .np-sm { flex: none; height: auto; }
  .np-sm .np-results { max-height: 14rem; }
  /* The Command's root, through its class. */
  .np > :global(.np-command) {
    flex: 1 1 auto;
    min-height: 0;
    gap: var(--ds-space-sm);
  }
  .np-head {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
  }
  .np-scope { display: flex; }
  /* No tab stop: its rows are reached by the arrow keys from the search field
     (aria-activedescendant). */
  .np-results {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .np-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: calc(var(--ds-space-sm) / 2) var(--ds-space-sm);
    min-width: 0;
  }
  .np-glyph {
    display: inline-flex;
    flex: none;
    align-self: flex-start;
    padding-top: 0.1rem;
    color: var(--ds-color-muted);
  }
  .np-text {
    flex: 1 1 12rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .np-title { overflow-wrap: anywhere; }
  /* A marked row's title steps back; the note says why. */
  .np-marked { color: var(--ds-color-muted); }
  .np-meta {
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
    overflow-wrap: anywhere;
  }
  /* At full contrast, in a disabled row too. */
  .np-note {
    flex: none;
    margin-inline-start: auto;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-fg);
  }
  .np-action {
    flex: none;
    margin-inline-start: auto;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .np-foot {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--ds-space-sm) / 2) var(--ds-space-sm);
    padding-top: var(--ds-space-sm);
    border-top: 1px solid var(--ds-color-border);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .np-keys { margin-inline-start: auto; }
  .np-heading,
  .np-hint {
    flex: none;
    margin: 0;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .np-heading { padding: 0 var(--ds-space-sm) calc(var(--ds-space-sm) / 2); }
  .np-step-title {
    flex: none;
    margin: 0;
    font-size: var(--ds-text-md);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
  }
  .np-step-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .np-step-actions {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--ds-space-sm);
  }
</style>
