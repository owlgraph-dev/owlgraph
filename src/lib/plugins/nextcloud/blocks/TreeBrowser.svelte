<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Chooses a folder or file from a collection's tree (as the editor reads it)
  // or from the editor's own Nextcloud (`own/listing`, through their connection),
  // live, folder by folder.
  import { untrack } from 'svelte';
  import { Alert, Button, Dialog, FieldRow, Select } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { t } from '../messages';
  import { nameOf, parentOf } from '../sharePath';
  import { PLUGIN_ROUTES } from './routes';
  import type { TreeChoice, TreeSource } from './tree';

  let {
    open,
    source,
    select,
    startPath = '',
    sharesOnly = false,
    title,
    description,
    chooseLabel,
    onOpenChange,
    onChoose,
  }: {
    open: boolean;
    source: TreeSource;
    /** The folder the editor stands in, or a file in it. */
    select: 'folder' | 'file';
    startPath?: string;
    /** Only shares' collections: a collection's document is made of a share's file, never of someone's own. */
    sharesOnly?: boolean;
    title: string;
    description: string;
    chooseLabel: string;
    onOpenChange: (open: boolean) => void;
    onChoose: (choice: TreeChoice) => void;
  } = $props();

  type Entry = { path: string; name: string; folder: boolean; fileid: string | null };

  let collections = $state<{ value: string; label: string }[]>([]);
  let current = $state<string | null>(untrack(() => (source.kind === 'collection' ? source.collectionId : null)));
  let path = $state(untrack(() => startPath));
  let root = $state('');
  // A folder of one's own files is chosen by its id; a collection's start folder by its path.
  let folderId = $state<string | null>(null);
  let entries = $state<Entry[]>([]);
  let chosen = $state<Entry | null>(null);
  let busy = $state(false);
  let failed = $state(false);
  let access = $state<{ reason: 'connect' | 'renew'; href: string } | null>(null);
  let off = $state(false);

  const own = $derived(source.kind === 'own');
  const shown = $derived(select === 'folder' ? entries.filter((e) => e.folder) : entries);

  async function loadCollections() {
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/collections?q=`, { headers: { accept: 'application/json' } });
      if (res.ok) {
        const body = (await res.json()) as { collections: { id: string; title: string; own?: boolean }[]; reason?: string };
        off = body.reason === 'disabled';
        collections = body.collections.filter((c) => !(sharesOnly && c.own)).map((c) => ({ value: c.id, label: c.title }));
      }
    } catch {
      collections = [];
    }
  }

  async function show(next: string) {
    if (!own && !current) return;
    busy = true;
    failed = false;
    try {
      const query = new URLSearchParams({ p: next, limit: '200' });
      if (own) query.set('r', `${window.location.pathname}${window.location.search}`);
      else query.set('c', current ?? '');
      const res = await fetch(`${PLUGIN_ROUTES}/${own ? 'own/listing' : 'listing'}?${query}`, { headers: { accept: 'application/json' } });
      const view = res.ok
        ? ((await res.json()) as { state: string; reason?: string; access?: 'connect' | 'renew'; connectHref?: string; root?: string; folder?: { fileid: string | null } | null; entries: Entry[] })
        : null;
      if (view?.reason === 'disabled') {
        off = true;
        entries = [];
        return;
      }
      if (view?.access) {
        access = { reason: view.access, href: view.connectHref ?? '' };
        entries = [];
        return;
      }
      access = null;
      if (!view || view.state === 'unavailable') {
        failed = true;
        return;
      }
      path = next;
      root = own ? t('own_browser_root') : (view.root ?? '');
      folderId = view.folder?.fileid ?? null;
      entries = view.entries;
      chosen = null;
    } catch {
      failed = true;
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    untrack(() => {
      if (source.kind === 'collection' && !source.collectionId) void loadCollections();
      if (own || current) void show(path);
    });
  });

  function pickCollection(id: string) {
    current = id;
    path = '';
    void show('');
  }

  const location = $derived(path === '' ? root : `${root} / ${path.split('/').join(' / ')}`);
  const ready = $derived(!busy && !failed && !access && !off && (own || !!current));

  function choose() {
    if (select === 'file') {
      if (!chosen?.fileid) return;
      const picked = { path: chosen.path, fileid: chosen.fileid, name: chosen.name };
      onChoose(own ? { kind: 'own', ...picked } : { kind: 'collection', collectionId: current ?? '', ...picked });
    } else {
      if (own && !folderId) return;
      const picked = { path, fileid: folderId, name: path === '' ? root : nameOf(path) };
      onChoose(own ? { kind: 'own', ...picked } : { kind: 'collection', collectionId: current ?? '', ...picked });
    }
    onOpenChange(false);
  }
</script>

<Dialog {open} {onOpenChange} size="sm" {title} {description}>
  <div class="nc-tree">
    {#if off}
      <Alert tone="warning">{t('connect_disabled')}</Alert>
    {:else if source.kind === 'collection' && !source.collectionId}
      <FieldRow layout="stack" label={t('browser_collection')}>
        <Select size="sm" width="full" items={collections} value={current ?? ''} placeholder={t('source_collection_none')} ariaLabel={t('browser_collection')} onValueChange={pickCollection} />
      </FieldRow>
    {/if}
    {#if !off && access}
      <Alert tone="warning">{access.reason === 'connect' ? t('own_browser_connect') : t('own_browser_renew')}</Alert>
      <div class="nc-tree-actions">
        <Button size="sm" variant="secondary" href={access.href} target="_blank" rel="noopener">{t('own_browser_open_connections')} <Icon name="external-link" size={12} /></Button>
        <Button size="sm" variant="ghost" loading={busy} onclick={() => show(path)}>{t('own_browser_retry')}</Button>
      </div>
    {:else if !off && (own || current)}
      <p class="nc-tree-location"><Icon name="folder" size={16} /> <span>{location}</span></p>
      {#if failed}
        <Alert tone="danger">{t('picker_failed')}</Alert>
      {:else}
        <ul class="nc-tree-list">
          {#if path !== ''}
            <li><Button size="sm" variant="ghost" disabled={busy} onclick={() => show(parentOf(path) ?? '')}><Icon name="arrow-up" size={14} /> {t('picker_up')}</Button></li>
          {/if}
          {#each shown as entry (entry.path)}
            <li>
              {#if entry.folder}
                <Button size="sm" variant="ghost" disabled={busy} onclick={() => show(entry.path)}><Icon name="folder" size={14} /> {entry.name}</Button>
              {:else}
                <Button size="sm" variant="ghost" disabled={busy || !entry.fileid} active={chosen?.path === entry.path} aria-pressed={chosen?.path === entry.path} onclick={() => (chosen = entry)}>
                  <Icon name="file" size={14} /> {entry.name}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if !busy && shown.length === 0}<p class="nc-tree-empty">{select === 'folder' ? t('picker_empty') : t('browser_empty')}</p>{/if}
      {/if}
    {/if}
  </div>
  {#snippet footer()}
    <Button variant="secondary" onclick={() => onOpenChange(false)}>{t('picker_cancel')}</Button>
    <Button variant="primary" disabled={!ready || (select === 'file' ? !chosen?.fileid : own && !folderId)} onclick={choose}>{chooseLabel}</Button>
  {/snippet}
</Dialog>

<style>
  .nc-tree { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .nc-tree-location { display: flex; align-items: center; gap: var(--ds-space-sm); margin: 0; font-weight: var(--ds-weight-semibold); overflow-wrap: anywhere; }
  .nc-tree-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: flex-start; max-height: 18rem; overflow-y: auto; }
  .nc-tree-empty { margin: 0; color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .nc-tree-actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
</style>
