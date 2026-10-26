<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The folder block (docs/architecture/nextcloud.md): the editor's
  // NodeView and the page's island, drawn through the content listing. The
  // editor's document action comes in as `editing`, null on the page.
  import { untrack } from 'svelte';
  import { BottomSheet, BottomSheetItem, Button, DropdownMenu, DropdownMenuItem, TriggerFace, toast } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { glyphSvg } from '$lib/design-system/icons';
  import {
    EntryList,
    dateText as formatDate,
    fileGlyph,
    fill,
    opensInline,
    sizeText as formatSize,
    type EntryPlaceholder,
    type EntryRow,
  } from '$lib/features/content/listing';
  import { isWithin, nameOf, parentOf } from '../../sharePath';
  import { FOLDER_SORT_KEYS, type FolderSortDir, type FolderSortKey } from './model';
  import type { FolderProps } from './view';
  import type { ListingEntry, ListingView } from '../../server/listing.server';

  let { mode, collectionId, config, initial, texts, locale, renderedAt, base, class: className = '', editing = null, provenance = null, ...rest }: FolderProps = $props();

  // The reader's own view, never stored.
  let path = $state(untrack(() => config.startPath));
  let sortKey = $state<FolderSortKey>(untrack(() => config.sortKey));
  let sortDir = $state<FolderSortDir>(untrack(() => config.sortDir));
  let view = $state<ListingView | null | undefined>(untrack(() => initial));
  let busy = $state(false);
  let now = $state(untrack(() => renderedAt));
  let creating = $state<string | null>(null);
  let sheetOpen = $state(false);
  let pendingKey = $state<FolderSortKey>(untrack(() => config.sortKey));
  let pendingDir = $state<FolderSortDir>(untrack(() => config.sortDir));

  const status = $derived(!collectionId ? 'unconfigured' : view === undefined ? 'loading' : view === null ? 'unavailable' : view.state);
  const entries = $derived(view?.entries ?? []);
  const total = $derived(view?.total ?? 0);
  const listed = $derived(status === 'ready' || status === 'stale');
  const more = $derived(listed && entries.length < total);

  // In the props' language and UTC, so the server and the browser write them alike;
  // "how long ago" counts from `renderedAt` until the clock runs here.
  const sizeText = (bytes: number | null) => formatSize(bytes, locale);
  const dateText = (iso: string | null) => formatDate(iso, locale);
  function agoText(iso: string | null): string {
    if (!iso) return '';
    const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    const abs = Math.abs(seconds);
    if (abs < 60) return format.format(seconds, 'second');
    if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
    return format.format(Math.round(seconds / 86400), 'day');
  }

  const inlineSafe = (entry: ListingEntry) => opensInline(entry.mime);
  const glyphOf = (entry: ListingEntry) => (entry.folder ? 'folder' : fileGlyph(entry.mime));
  // The same address for every reader; the route answers with a grant for whoever follows it.
  const openHref = (entry: ListingEntry, download = false) =>
    `${base}/open?${new URLSearchParams({ c: collectionId ?? '', p: entry.path, f: entry.fileid ?? '', ...(download ? { download: '1' } : {}) })}`;
  const metaLine = (entry: ListingEntry) => [entry.folder ? '' : sizeText(entry.size), dateText(entry.modified)].filter(Boolean).join(' · ');

  const crumbs = $derived.by(() => {
    const out = [{ name: config.startPath === '' ? (view?.root ?? '') : nameOf(config.startPath), path: config.startPath }];
    if (path !== config.startPath && isWithin(path, config.startPath)) {
      let at = config.startPath;
      for (const segment of (config.startPath === '' ? path : path.slice(config.startPath.length + 1)).split('/')) {
        at = at ? `${at}/${segment}` : segment;
        out.push({ name: segment, path: at });
      }
    }
    return out;
  });
  const currentName = $derived(crumbs[crumbs.length - 1]?.name ?? '');
  const sortLabel = $derived(fill(texts.sortButton, { key: texts.sortKeys[sortKey], dir: texts.sortDirs[sortDir] }));
  // Only on a node's own page: a block says nothing of whose files it shows.
  const readVia = $derived(provenance && view ? (view.via === 'user' ? provenance.user : view.via === 'node' ? provenance.node : '') : '');
  const footerLine = $derived(
    view && listed
      ? [
          fill(texts.count, { shown: entries.length, total }),
          [texts.source, readVia, agoText(view.checkedAt)].filter(Boolean).join(', '),
          view.state === 'stale' ? texts.stale : '',
          view.state === 'stale' && texts.editor && view.reason ? texts.editor.reasons[view.reason] : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  );

  // The editor sees the reason and the repair; a reader a neutral line, never why.
  const placeholder = $derived.by((): EntryPlaceholder | null => {
    if (status === 'unconfigured' && texts.editor) return { glyph: 'folder', status: false, body: texts.editor.unconfigured };
    if (status === 'unavailable' && view?.access) {
      const renew = view.access === 'renew';
      return {
        glyph: 'cloud',
        status: true,
        title: renew ? texts.access.renewTitle : texts.access.connectTitle,
        body: renew ? texts.access.renewBody : texts.access.connectBody,
        // A full navigation, under the connections page's own CSP (platform/cspRoutes.ts); from the editor, in a new tab.
        action: view.connectHref
          ? { label: renew ? texts.access.renewAction : texts.access.connectAction, href: view.connectHref, target: mode === 'editor' ? '_blank' : undefined, reload: true }
          : undefined,
      };
    }
    if (status !== 'unconfigured' && status !== 'unavailable') return null;
    if (texts.editor && view?.reason) {
      const known = view.collection;
      return {
        glyph: 'alert-triangle',
        tone: 'warning',
        editor: true,
        status: true,
        title: texts.editor.reasons[view.reason],
        body: known.count !== null && known.checkedAt ? fill(texts.editor.lastKnown, { count: known.count, date: dateText(known.checkedAt) }) : undefined,
        action: { label: texts.editor.repair, href: `${known.href}/edit`, target: '_blank', rel: 'noopener' },
      };
    }
    return { glyph: 'cloud-off', status: true, title: texts.unavailableTitle, body: texts.unavailableBody };
  });

  type Row = EntryRow & { entry: ListingEntry; linked: { id: string; href: string } | null };
  const rows = $derived(
    entries.map((entry): Row => {
      const linked = config.highlightLinked ? entry.linked : null;
      const opens = entry.folder && config.allowNavigate;
      const inline = inlineSafe(entry);
      return {
        key: entry.path,
        name: entry.name,
        glyph: glyphOf(entry),
        folder: entry.folder,
        chip: !opens && linked ? { glyph: 'link', label: texts.documentChip } : null,
        meta: metaLine(entry),
        size: entry.folder ? '' : sizeText(entry.size),
        modified: dateText(entry.modified),
        // `download` on a file a browser cannot show also keeps the app's router from taking the link for a page.
        target: opens
          ? { kind: 'open', open: () => void load({ to: entry.path }) }
          : !entry.folder && mode === 'page' && entry.fileid
            ? { kind: 'link', href: openHref(entry), target: inline ? '_blank' : undefined, rel: inline ? 'noopener' : undefined, download: inline ? undefined : entry.name }
            : { kind: 'static' },
        entry,
        linked,
      };
    })
  );

  // A later request supersedes an earlier one still in flight.
  let request = 0;
  async function load(opts: { to?: string; append?: boolean } = {}): Promise<void> {
    const id = collectionId;
    if (!id) return;
    const target = opts.to ?? path;
    const offset = opts.append && view ? view.entries.length : 0;
    const mine = ++request;
    busy = true;
    try {
      // `r`: where a viewer who connects their account returns to.
      const query = new URLSearchParams({
        c: id,
        p: target,
        sort: sortKey,
        dir: sortDir,
        offset: String(offset),
        limit: String(config.pageSize),
        r: `${window.location.pathname}${window.location.search}`,
      });
      const res = await fetch(`${base}/listing?${query}`, { headers: { accept: 'application/json' } });
      if (mine !== request) return;
      if (!res.ok) {
        // Not the viewer's to read, or no such collection: the same neutral state.
        view = null;
        return;
      }
      const next = (await res.json()) as ListingView;
      if (mine !== request) return;
      path = target;
      view = opts.append && view ? { ...next, entries: [...view.entries, ...next.entries] } : next;
    } catch {
      // A network failure keeps what was shown, marked stale.
      if (mine === request) view = view && view.entries.length > 0 ? { ...view, state: 'stale' } : null;
    } finally {
      if (mine === request) {
        busy = false;
        now = Date.now();
      }
    }
  }

  // Revalidates on mount and whenever the block settings panel changes what is listed. A page
  // the server already rendered as "connect your account" skips the first ask.
  const reloadKey = $derived(`${collectionId}\n${config.startPath}\n${config.pageSize}\n${config.sortKey}\n${config.sortDir}`);
  let settled = untrack(() => mode === 'page' && !!initial?.access);
  $effect(() => {
    void reloadKey;
    untrack(() => {
      path = config.startPath;
      sortKey = config.sortKey;
      sortDir = config.sortDir;
      if (settled) {
        settled = false;
        return;
      }
      void load();
    });
  });

  $effect(() => {
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  function up() {
    const parent = parentOf(path);
    if (parent !== null && isWithin(parent, config.startPath)) void load({ to: parent });
  }

  // A key picked again flips its direction; a new one starts with names A to Z, newest and largest first.
  const startDir = (key: FolderSortKey): FolderSortDir => (key === 'name' ? 'asc' : 'desc');
  function sortBy(key: FolderSortKey) {
    if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = startDir(key);
    }
    void load({ to: path });
  }
  function openSheet() {
    pendingKey = sortKey;
    pendingDir = sortDir;
    sheetOpen = true;
  }
  function pick(key: FolderSortKey) {
    if (key === pendingKey) pendingDir = pendingDir === 'asc' ? 'desc' : 'asc';
    else {
      pendingKey = key;
      pendingDir = startDir(key);
    }
  }
  function applySheet() {
    sheetOpen = false;
    if (pendingKey === sortKey && pendingDir === sortDir) return;
    sortKey = pendingKey;
    sortDir = pendingDir;
    void load({ to: path });
  }

  async function create(entry: ListingEntry) {
    if (!editing || !entry.fileid || creating) return;
    creating = entry.path;
    const made = await editing.createDocument(entry.path, entry.fileid);
    creating = null;
    if (!made) {
      toast.error(texts.editor?.createFailed ?? '');
      return;
    }
    if (view) view = { ...view, entries: view.entries.map((e) => (e.path === entry.path ? { ...e, linked: made } : e)) };
  }
</script>

{#snippet head()}
  <nav class="el-crumbs" aria-label={texts.breadcrumb}>
    {#each crumbs as crumb, i (crumb.path)}
      {#if i > 0}<span class="el-sep" aria-hidden="true">/</span>{/if}
      {#if i < crumbs.length - 1 && config.allowNavigate}
        <!-- ui-check-allow: raw-element — a breadcrumb segment is the listing's own text, an authored element the block's typography sets, not a control's face -->
        <button type="button" class="el-crumb" onclick={() => load({ to: crumb.path })}>{crumb.name}</button>
      {:else}
        <span class="el-crumb" class:el-crumb--current={i === crumbs.length - 1} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{crumb.name}</span>
      {/if}
    {/each}
  </nav>
  <div class="el-head-compact">
    {#if path !== config.startPath && config.allowNavigate}
      <Button size="sm" variant="ghost" icon aria-label={texts.back} title={texts.back} onclick={up}><Icon name="chevron-left" size={16} /></Button>
    {/if}
    <span class="el-current">{currentName}</span>
  </div>
  <div class="el-controls">
    <span class="el-sort-wide">
      <DropdownMenu ariaLabel={texts.sortTitle} triggerProps={{ 'aria-label': sortLabel, title: sortLabel }}>
        {#snippet trigger()}<TriggerFace variant="ghost" size="sm"><Icon name="arrow-up-down" size={14} /><span>{texts.sortKeys[sortKey]}</span></TriggerFace>{/snippet}
        {#each FOLDER_SORT_KEYS as key (key)}
          <DropdownMenuItem active={key === sortKey} onSelect={() => sortBy(key)}>
            {key === sortKey ? `${texts.sortKeys[key]} (${texts.sortDirs[sortDir]})` : texts.sortKeys[key]}
          </DropdownMenuItem>
        {/each}
      </DropdownMenu>
    </span>
    <span class="el-sort-compact">
      <Button size="sm" variant="ghost" icon aria-label={sortLabel} title={sortLabel} onclick={openSheet}><Icon name="arrow-up-down" size={16} /></Button>
    </span>
    <Button size="sm" variant="ghost" icon aria-label={texts.refresh} title={texts.refresh} loading={busy && status !== 'loading'} onclick={() => load({ to: path })}>
      <Icon name="refresh" size={16} />
    </Button>
  </div>
{/snippet}

{#snippet rowTrail(row: Row)}
  {@const entry = row.entry}
  {#if row.linked}
    {@const label = fill(texts.openDocument, { name: entry.name })}
    <a class="el-node" href={row.linked.href} target={mode === 'editor' ? '_blank' : undefined} aria-label={label} title={label}>{@html glyphSvg('arrow-right', 16)}</a>
  {:else if editing && texts.editor && !entry.folder && entry.fileid && !view?.collection.own}
    <span class="el-create">
      <Button size="sm" variant="ghost" loading={creating === entry.path} onclick={() => create(entry)}>{texts.editor.createDocument}</Button>
    </span>
  {/if}
  {#if entry.folder}
    <span class="el-chevron" aria-hidden="true">{@html glyphSvg('chevron-right', 16)}</span>
  {:else if mode === 'page' && entry.fileid}
    {@const label = fill(texts.download, { name: entry.name })}
    <a class="el-download" href={openHref(entry, true)} download={entry.name} aria-label={label} title={label}>{@html glyphSvg('download', 16)}</a>
  {/if}
{/snippet}

<EntryList
  {status}
  {mode}
  density={config.density}
  trail={editing && mode === 'page' ? 'wide' : 'narrow'}
  class={className}
  {placeholder}
  {head}
  columns={{
    name: texts.columns.name,
    size: { label: texts.columns.size, shown: config.showSize },
    modified: { label: texts.columns.modified, shown: config.showModified },
  }}
  loading={status === 'loading'}
  {rows}
  empty={texts.empty}
  trailing={rowTrail}
  footer={status === 'loading' ? texts.loading : footerLine}
  more={more ? { label: texts.loadMore, busy, load: () => void load({ to: path, append: true }) } : null}
  {...rest}
/>

<BottomSheet bind:open={sheetOpen} title={texts.sortTitle}>
  <div class="nc-folder-sheet">
    {#each FOLDER_SORT_KEYS as key (key)}
      <BottomSheetItem active={key === pendingKey} onclick={() => pick(key)}>
        {texts.sortKeys[key]}
        {#snippet trailing()}
          {#if key === pendingKey}<span class="nc-folder-sheet-dir">{texts.sortDirs[pendingDir]}</span><Icon name="check" size={16} />{/if}
        {/snippet}
      </BottomSheetItem>
    {/each}
  </div>
  {#snippet footer()}
    <Button variant="secondary" onclick={() => (sheetOpen = false)}>{texts.cancel}</Button>
    <Button variant="primary" onclick={applySheet}>{texts.apply}</Button>
  {/snippet}
</BottomSheet>

<style>
  /* The sort sheet is chrome, outside the block: chrome tokens. */
  .nc-folder-sheet { display: flex; flex-direction: column; }
  .nc-folder-sheet-dir { color: var(--ds-color-muted); font-size: var(--ds-text-xs); margin-inline-end: var(--ds-space-sm); }
</style>
