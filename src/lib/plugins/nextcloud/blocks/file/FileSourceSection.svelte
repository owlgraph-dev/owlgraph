<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The file block's Source section: its rows, inside the block settings panel's frame. It
  // reads the document from the editor's store (documents.ts), as the block
  // does, so a change here shows there at once.
  import { onDestroy, untrack } from 'svelte';
  import { Button, FieldRow, Select, toast } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { currentLocale, type PluginSectionProps } from '$lib/plugins/api';
  import { t } from '../../messages';
  import type { DocumentView } from '../../server/documents.server';
  import type { SourceStatus } from '../../server/refs';
  import { sizeText } from '$lib/features/content/listing';
  import { PLUGIN_ROUTES } from '../routes';
  import TreeBrowser from '../TreeBrowser.svelte';
  import type { TreeChoice, TreeSource } from '../tree';
  import { createDocument, rebindDocument, watchDocument } from './documents';
  import { fileConfig } from './model';
  import { Browsing } from '../browsing.svelte';

  let { target, pageId, overlayOpenChange }: PluginSectionProps = $props();

  type DocumentOption = { id: string; title: string };

  const config = $derived(fileConfig(target.attrs));
  let documents = $state<DocumentOption[]>([]);
  let view = $state<DocumentView | null | undefined>(undefined);
  // `new`: a share's file for a new document; `own`: the editor's own file; `other`: another file for this one.
  const browsing = new Browsing<'new' | 'own' | 'other'>(() => overlayOpenChange);
  // The plugin is off: no file to choose.
  let searchOff = $state(false);
  const off = $derived(searchOff || view?.status === 'disabled');

  const STATUS_TEXT: Record<Exclude<SourceStatus, 'ok'>, () => string> = {
    notFound: () => t('file_not_found'),
    unauthorized: () => t('status_unauthorized'),
    revoked: () => t('status_revoked'),
    unreachable: () => t('status_unreachable'),
    disabled: () => t('status_disabled'),
    unconfigured: () => t('status_unconfigured'),
    tooLarge: () => t('status_too_large'),
  };

  async function loadDocuments() {
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/documents?q=`, { headers: { accept: 'application/json' } });
      if (res.ok) {
        const body = (await res.json()) as { documents: DocumentOption[]; reason?: string };
        documents = body.documents.map((d) => ({ id: d.id, title: d.title }));
        searchOff = body.reason === 'disabled';
      }
    } catch {
      documents = [];
    }
  }
  $effect(() => {
    void loadDocuments();
  });

  $effect(() => {
    const id = config.documentId;
    view = undefined;
    if (!id) return;
    return untrack(() => watchDocument(id, (next) => (view = next)));
  });

  const items = $derived.by(() => {
    const list = documents.map((d) => ({ value: d.id, label: d.title }));
    const current = view;
    if (current && !list.some((item) => item.value === current.id)) list.unshift({ value: current.id, label: current.title });
    return list;
  });
  const fileLine = $derived(
    view?.file
      ? [view.file.filename, view.fileid ? t('file_fileid', { fileid: view.fileid }) : '', sizeText(view.file.size, currentLocale())].filter(Boolean).join(' · ')
      : ''
  );
  const status = $derived(view ? (view.status === 'ok' ? { text: t('file_source_ok'), warning: false } : { text: STATUS_TEXT[view.status](), warning: true }) : null);

  function choose(documentId: string) {
    if (documentId && documentId !== config.documentId) target.update({ documentId });
  }

  onDestroy(() => browsing.close());

  // A new document's file anywhere; another file where this one's is.
  const browseSource = $derived<TreeSource>(
    browsing.kind === 'own' || (browsing.kind === 'other' && view?.own) ? { kind: 'own' } : { kind: 'collection', collectionId: browsing.kind === 'other' ? (view?.collectionId ?? null) : null }
  );

  async function chosen(choice: TreeChoice) {
    if (browsing.kind === 'other' && config.documentId) {
      if (!(await rebindDocument(config.documentId, choice))) toast.error(t('file_rebind_failed'));
      return;
    }
    const made = await createDocument(choice, pageId);
    if (!made) {
      toast.error(t('folder_create_failed'));
      return;
    }
    documents = [{ id: made.id, title: made.title }, ...documents.filter((d) => d.id !== made.id)];
    target.update({ documentId: made.id });
  }
</script>

<FieldRow layout="stack" label={t('file_source_document')}>
  <div class="nc-file-source-document">
    <Select size="sm" width="full" {items} value={config.documentId ?? ''} placeholder={t('file_source_document_none')} ariaLabel={t('file_source_document')} onValueChange={choose} />
    {#if off}
      <p class="nc-file-source-line nc-file-source-line--warning">{t('connect_disabled')}</p>
    {:else}
      <div class="nc-file-source-new">
        <Button size="sm" variant="link" onclick={() => browsing.open('new')}>{t('file_source_from_folder')}</Button>
        <Button size="sm" variant="link" onclick={() => browsing.open('own')}>{t('source_from_own')}</Button>
      </div>
    {/if}
  </div>
</FieldRow>

{#if config.documentId && view}
  {#if fileLine}
    <FieldRow layout="stack" label={t('file_source_file')}>
      <p class="nc-file-source-line">{fileLine}</p>
    </FieldRow>
  {/if}
  <FieldRow layout="stack" label={t('source_status')}>
    <p class="nc-file-source-line" class:nc-file-source-line--warning={status?.warning}>{status?.text ?? ''}</p>
  </FieldRow>
  <div class="nc-file-source-links">
    <Button size="sm" variant="link" href={view.href} target="_blank" rel="noopener">{t('file_open_node')} <Icon name="external-link" size={12} /></Button>
    {#if view.collectionId || view.own}
      <Button size="sm" variant="link" onclick={() => browsing.open('other')}>{t('file_source_other')}</Button>
    {/if}
  </div>
{/if}

{#if browsing.kind}
  <TreeBrowser
    open={browsing.kind !== null}
    source={browseSource}
    select="file"
    sharesOnly
    title={browseSource.kind === 'own' ? t('own_browser_file_title') : t('browser_title')}
    description={browsing.kind === 'other' ? t('file_other_desc') : browseSource.kind === 'own' ? t('own_browser_file_desc') : t('browser_desc')}
    chooseLabel={t('browser_choose')}
    onOpenChange={(open) => {
      if (!open) browsing.close();
    }}
    onChoose={chosen}
  />
{/if}

<style>
  .nc-file-source-document { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ds-space-sm); min-width: 0; }
  .nc-file-source-new { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm) var(--ds-space-md); }
  .nc-file-source-line { margin: 0; min-width: 0; overflow-wrap: anywhere; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .nc-file-source-line--warning { color: var(--ds-color-warning); }
  .nc-file-source-links { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm) var(--ds-space-md); padding: 0 0 var(--ds-space-sm); }
</style>
