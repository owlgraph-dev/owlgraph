<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The folder block's Source section: its rows, inside the block settings panel's frame. A
  // collection's source is connected anew on the collection's own page.
  import { onDestroy, untrack } from 'svelte';
  import { Button, FieldRow, Select, toast } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import type { PluginSectionProps } from '$lib/plugins/api';
  import { t } from '../../messages';
  import type { SourceStatus } from '../../server/refs';
  import { PLUGIN_ROUTES } from '../routes';
  import TreeBrowser from '../TreeBrowser.svelte';
  import type { TreeChoice } from '../tree';
  import { folderConfig } from './model';
  import ShareDialog from './ShareDialog.svelte';
  import { Browsing } from '../browsing.svelte';

  let { target, pageId, overlayOpenChange }: PluginSectionProps = $props();

  type CollectionOption = { id: string; title: string; href: string };

  const config = $derived(folderConfig(target.attrs));
  let collections = $state<CollectionOption[]>([]);
  let shareOpen = $state(false);
  // `start`: the start folder in the collection; `own`: a folder of the editor's own Nextcloud.
  const browsing = new Browsing<'start' | 'own'>(() => overlayOpenChange);
  let status = $state<{ text: string; warning: boolean } | null>(null);

  const STATUS_TEXT: Record<Exclude<SourceStatus, 'ok'>, () => string> = {
    unauthorized: () => t('status_unauthorized'),
    revoked: () => t('status_revoked'),
    notFound: () => t('status_not_found'),
    unreachable: () => t('status_unreachable'),
    disabled: () => t('status_disabled'),
    unconfigured: () => t('status_unconfigured'),
    tooLarge: () => t('status_too_large'),
  };

  async function loadCollections() {
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/collections?q=`, { headers: { accept: 'application/json' } });
      if (res.ok) collections = ((await res.json()) as { collections: CollectionOption[] }).collections;
    } catch {
      collections = [];
    }
  }
  $effect(() => {
    void loadCollections();
  });

  // One entry is enough to know how the share answers at the start folder.
  async function loadStatus(collectionId: string | null, path: string) {
    if (!collectionId) {
      status = null;
      return;
    }
    status = { text: t('source_status_checking'), warning: false };
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/listing?${new URLSearchParams({ c: collectionId, p: path, limit: '1' })}`, { headers: { accept: 'application/json' } });
      const view = res.ok ? ((await res.json()) as { state: string; total: number; reason?: Exclude<SourceStatus, 'ok'> }) : null;
      if (view && (view.state === 'ready' || view.state === 'stale') && !view.reason) status = { text: t('source_status_ok', { count: view.total }), warning: false };
      else status = { text: view?.reason ? STATUS_TEXT[view.reason]() : t('status_unreachable'), warning: true };
    } catch {
      status = { text: t('status_unreachable'), warning: true };
    }
  }
  $effect(() => {
    const collectionId = config.collectionId;
    const path = config.startPath;
    untrack(() => void loadStatus(collectionId, path));
  });

  const items = $derived(collections.map((c) => ({ value: c.id, label: c.title })));
  const current = $derived(collections.find((c) => c.id === config.collectionId) ?? null);

  // Open dialogs count as the editor's overlays (its Escape handling).
  onDestroy(() => {
    if (shareOpen) overlayOpenChange(false);
    browsing.close();
  });

  function choose(collectionId: string) {
    if (collectionId && collectionId !== config.collectionId) target.update({ collectionId, startPath: '' });
  }


  /** Makes a folder of the editor's own Nextcloud a collection beside the page. */
  async function chooseOwn(choice: TreeChoice) {
    if (choice.kind !== 'own' || !choice.fileid) return;
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/collections`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ pageId, own: { path: choice.path, fileid: choice.fileid } }),
      });
      const body = (await res.json().catch(() => null)) as { collection?: CollectionOption; error?: { code?: string; message?: string } } | null;
      if (!res.ok || !body?.collection) {
        toast.error(body?.error?.message ?? t('own_create_failed'));
        return;
      }
      const made = body.collection;
      collections = [made, ...collections.filter((c) => c.id !== made.id)];
      target.update({ collectionId: made.id, startPath: '' });
    } catch {
      toast.error(t('own_create_failed'));
    }
  }
</script>

<FieldRow layout="stack" label={t('source_collection')}>
  <div class="nc-folder-source-collection">
    <Select size="sm" width="full" {items} value={config.collectionId ?? ''} placeholder={t('source_collection_none')} ariaLabel={t('source_collection')} onValueChange={choose} />
    <div class="nc-folder-source-new">
      <Button
        size="sm"
        variant="link"
        onclick={() => {
          shareOpen = true;
          overlayOpenChange(true);
        }}>{t('source_new_share')}</Button
      >
      <Button size="sm" variant="link" onclick={() => browsing.open('own')}>{t('source_from_own')}</Button>
    </div>
  </div>
</FieldRow>

{#if config.collectionId}
  <FieldRow layout="stack" label={t('source_start')}>
    <div class="nc-folder-source-start">
      <span class="nc-folder-source-path">{config.startPath || t('source_start_root')}</span>
      <Button size="sm" onclick={() => browsing.open('start')}>{t('source_start_change')}</Button>
    </div>
  </FieldRow>
  <FieldRow layout="stack" label={t('source_status')}>
    <p class="nc-folder-source-status" class:nc-folder-source-status--warning={status?.warning}>{status?.text ?? ''}</p>
  </FieldRow>
  {#if current}
    <div class="nc-folder-source-open">
      <Button size="sm" variant="link" href={current.href} target="_blank" rel="noopener">{t('source_open_collection')} <Icon name="external-link" size={12} /></Button>
    </div>
  {/if}
{/if}

{#if shareOpen}
  <ShareDialog
    open={shareOpen}
    {pageId}
    onOpenChange={(open) => {
      if (open || !shareOpen) return;
      shareOpen = false;
      overlayOpenChange(false);
    }}
    onConnected={(collection) => {
      collections = [collection, ...collections.filter((c) => c.id !== collection.id)];
      target.update({ collectionId: collection.id, startPath: '' });
    }}
  />
{/if}

{#if browsing.kind === 'start' && config.collectionId}
  <TreeBrowser
    open={true}
    source={{ kind: 'collection', collectionId: config.collectionId }}
    select="folder"
    startPath={config.startPath}
    title={t('picker_title')}
    description={t('picker_desc')}
    chooseLabel={t('picker_choose')}
    onOpenChange={(open) => {
      if (!open) browsing.close();
    }}
    onChoose={(choice) => target.update({ startPath: choice.path })}
  />
{:else if browsing.kind === 'own'}
  <TreeBrowser
    open={true}
    source={{ kind: 'own' }}
    select="folder"
    title={t('own_browser_folder_title')}
    description={t('own_browser_folder_desc')}
    chooseLabel={t('own_browser_folder_choose')}
    onOpenChange={(open) => {
      if (!open) browsing.close();
    }}
    onChoose={chooseOwn}
  />
{/if}

<style>
  .nc-folder-source-collection { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ds-space-sm); min-width: 0; }
  .nc-folder-source-new { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm) var(--ds-space-md); }
  .nc-folder-source-start { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-sm); min-width: 0; }
  .nc-folder-source-path { min-width: 0; overflow-wrap: anywhere; font-size: var(--ds-text-sm); }
  .nc-folder-source-status { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .nc-folder-source-status--warning { color: var(--ds-color-warning); }
  .nc-folder-source-open { padding: 0 0 var(--ds-space-sm); }
</style>
