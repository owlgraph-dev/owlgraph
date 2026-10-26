<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Dialog has no multi-step pattern, so the grid and document views are
  // switched inside its children.
  import { createBlankPageViaApi } from '$lib/features/pages';
  import type { DocumentSource } from '$lib/features/documents';
  import { createCuratedCollection } from '$lib/features/collections';
  import { NewDocumentForm } from '$lib/features/documents/create';
  // The editor runs under a looser style-src (platform/cspRoutes.ts) and a
  // policy belongs to the document: a full navigation, never goto().
  const openEditor = (href: string) => window.location.assign(href);
  import { page } from '$app/stores';
  import { Dialog, Button, Alert, FormField, Select } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { CREATE_CARDS, type CreateCard } from './createCards';
  import { nodePath } from '$lib/features/nodes';
  import * as m from '$lib/paraglide/messages';

  let { open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void } = $props();

  type View = 'grid' | 'document';

  let view = $state<View>('grid');

  // The root layout loads these for every request.
  const namespaces = $derived($page.data.namespaces as { id: string; name: string; slug: string | null; isDefault: boolean }[] ?? []);
  let namespaceId = $state<string | null>(null);
  $effect(() => {
    if (open) namespaceId = namespaces.find((n) => n.isDefault)?.id ?? null;
  });

  let pageBusy = $state(false);
  let pageError = $state<string | null>(null);

  // NewDocumentForm mounts afresh each time the document view opens.
  const docFormId = $props.id();
  let docSource = $state<DocumentSource>('upload');
  let docBusy = $state(false);

  $effect(() => {
    if (open) {
      view = 'grid';
      pageBusy = false;
      pageError = null;
      docSource = 'upload';
      docBusy = false;
    }
  });

  const groupedCards = $derived.by(() => {
    const groups = new Map<string, CreateCard[]>();
    for (const card of CREATE_CARDS) {
      const list = groups.get(card.group) ?? [];
      list.push(card);
      groups.set(card.group, list);
    }
    return [...groups.entries()];
  });

  function close() {
    onOpenChange(false);
  }

  // Resolved here, not stored in createCards.ts: a static array would not
  // follow a locale switch.
  function cardLabel(card: CreateCard) {
    if (card.kind === 'collection') return m.create_modal_card_collection_label();
    return card.kind === 'page' ? m.create_modal_card_page_label() : m.create_modal_card_document_label();
  }
  function cardDesc(card: CreateCard) {
    if (card.kind === 'collection') return m.create_modal_card_collection_desc();
    return card.kind === 'page' ? m.create_modal_card_page_desc() : m.create_modal_card_document_desc();
  }

  function selectCard(card: CreateCard) {
    if (card.kind === 'page') createBlankPageAndGo();
    else if (card.kind === 'collection') createCollectionAndGo();
    else view = 'document';
  }

  function selectedNamespaceSlug(): string | null {
    const ns = namespaces.find((n) => n.id === namespaceId);
    return ns && !ns.isDefault ? ns.slug : null;
  }

  async function createBlankPageAndGo() {
    pageBusy = true;
    pageError = null;
    try {
      const res = await createBlankPageViaApi(namespaceId);
      if (!res.ok) {
        pageError = res.error ?? m.create_modal_error_generic_create();
        return;
      }
      close();
      openEditor(nodePath(selectedNamespaceSlug(), res.slug, { edit: true }));
    } catch {
      pageError = m.create_modal_error_generic_create();
    } finally {
      pageBusy = false;
    }
  }

  async function createCollectionAndGo() {
    pageBusy = true;
    pageError = null;
    try {
      const res = await createCuratedCollection(namespaceId);
      if (!res.ok) {
        pageError = res.error ?? m.create_modal_error_generic_create();
        return;
      }
      close();
      openEditor(nodePath(selectedNamespaceSlug(), res.slug, { edit: true }));
    } catch {
      pageError = m.create_modal_error_generic_create();
    } finally {
      pageBusy = false;
    }
  }

  function documentCreated(doc: { slug: string }) {
    close();
    openEditor(nodePath(selectedNamespaceSlug(), doc.slug, { edit: true }));
  }
</script>

<!-- One title for every view: it is the dialog's accessible name, which must
     not change mid-interaction. The document view has its own sub-heading. -->
<Dialog
  {open}
  {onOpenChange}
  size="lg"
  title={m.create_modal_title()}
>
  {#if view === 'grid'}
    {#if namespaces.length > 1}
      <div class="ns-picker">
        <FormField label={m.create_modal_namespace_label()}>
          <Select
            items={namespaces.map((ns) => ({ value: ns.id, label: ns.isDefault ? m.create_modal_namespace_default_option() : ns.name }))}
            value={namespaceId ?? ''}
            onValueChange={(v) => (namespaceId = v)}
          />
        </FormField>
      </div>
    {/if}
    {#each groupedCards as [, cards] (cards[0]?.group)}
      <div class="card-grid">
        {#each cards as card (card.id)}
          <!-- Named by its title alone, its description read as one: "Page", not the card's whole text. -->
          <!-- ui-check-allow: raw-element — a choice card (icon, title, one-line description) in a grid; no Button size holds three stacked lines -->
          <button
            class="create-card"
            onclick={() => selectCard(card)}
            disabled={pageBusy}
            aria-labelledby="create-card-{card.id}-label"
            aria-describedby="create-card-{card.id}-desc"
          >
            <Icon name={card.icon} size={22} />
            <span class="card-label" id="create-card-{card.id}-label">{cardLabel(card)}</span>
            <span class="card-desc" id="create-card-{card.id}-desc">{cardDesc(card)}</span>
          </button>
        {/each}
      </div>
    {/each}
    {#if pageError}<div class="create-alert"><Alert tone="danger">{pageError}</Alert></div>{/if}
    {#if pageBusy}<p class="create-hint">{m.create_modal_creating()}</p>{/if}
  {:else if view === 'document'}
    <h3 class="upload-heading">{m.create_modal_upload_title()}</h3>
    <NewDocumentForm id={docFormId} {namespaceId} bind:busy={docBusy} bind:source={docSource} onCreated={documentCreated} />
  {/if}

  {#snippet footer()}
    {#if view === 'grid'}
      <Button variant="secondary" onclick={close}>{m.create_modal_cancel()}</Button>
    {:else}
      <Button variant="secondary" onclick={() => (view = 'grid')} disabled={docBusy}>{m.create_modal_back()}</Button>
      <Button type="submit" form={docFormId} variant="primary" loading={docBusy}>
        {docSource === 'link' ? m.create_modal_create() : m.create_modal_upload()}
      </Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .upload-heading {
    margin: 0 0 0.7rem;
    font-size: var(--ds-text-lg);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
  }
  .ns-picker { margin: 0 0 0.8rem; }
  .card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .create-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    text-align: left;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: none;
    color: var(--ds-color-fg);
    padding: 0.7rem 0.8rem;
    cursor: pointer;
    font: inherit;
  }
  .create-card:hover:not(:disabled) {
    border-color: var(--ds-color-border-hover);
    background: var(--ds-color-fill-hover);
  }
  .create-card:active:not(:disabled) {
    border-color: var(--ds-color-border-hover);
    background: var(--ds-color-fill-pressed);
  }
  .create-card:disabled {
    opacity: var(--ds-opacity-disabled);
    cursor: default;
  }
  .card-label {
    font-weight: var(--ds-weight-semibold);
  }
  .card-desc {
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .create-hint {
    color: var(--ds-color-muted);
    font-size: var(--ds-text-sm);
    margin: 0.7rem 0 0;
  }
  .create-alert { margin-top: 0.7rem; }
</style>
