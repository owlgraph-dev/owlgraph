<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The file block (docs/architecture/nextcloud.md): the editor's
  // NodeView and the page's server render. Nothing hydrates: its links go to the
  // document's content, which answers each follower with a grant of their own.
  // The editor's actions (`editing`) and texts (`texts.editor`) are null on the page.
  import { untrack } from 'svelte';
  import { Button, toast } from '$lib/design-system';
  import {
    DocumentEntry,
    dateText,
    fileGlyph,
    fill,
    opensInline,
    sizeText,
    typeLabel,
    type DocumentEntryFile,
    type DocumentPlaceholder,
  } from '$lib/features/content/listing';
  import TreeBrowser from '../TreeBrowser.svelte';
  import type { TreeChoice } from '../tree';
  import type { FileProps } from './view';
  import type { DocumentView } from '../../server/documents.server';

  let { mode, documentId, config, initial, texts, locale, class: className = '', editing = null, ...rest }: FileProps = $props();

  let view = $state<DocumentView | null | undefined>(untrack(() => initial));
  let checking = $state(false);
  let browsing = $state(false);

  $effect(() => {
    const edit = editing;
    if (!edit) return;
    return untrack(() => edit.watch((next) => (view = next)));
  });

  // Unresolved on the page (an agent's view) reads as unavailable; in the editor it is loading.
  const status = $derived(
    !documentId
      ? 'unconfigured'
      : view === undefined
        ? editing
          ? 'loading'
          : 'unavailable'
        : view === null || view.access === 'unavailable'
          ? 'unavailable'
          : view.access
            ? 'access'
            : view.status === 'ok'
              ? 'ready'
              : 'problem'
  );
  const reason = $derived(view && view.status !== 'ok' ? view.status : null);
  const filename = $derived(view ? (view.file?.filename ?? view.title) : '');
  const title = $derived((config.titleMode === 'auto' ? (config.variant === 'card' ? 'node' : 'filename') : config.titleMode) === 'node' ? (view?.title ?? '') : filename);
  const mime = $derived(view?.file?.mime ?? null);
  const inline = $derived(opensInline(mime));
  const type = $derived(typeLabel(filename));

  // An image a browser shows and can afford to load is its own preview; any other file a tile.
  const PREVIEW_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
  const size = $derived(view?.file?.size ?? null);
  const showImage = $derived(!!mime && PREVIEW_MIME.has(mime) && size !== null && size <= PREVIEW_MAX_BYTES && !!view?.content);

  const facts = $derived(view ? [title !== filename ? filename : '', type ?? '', sizeText(size, locale), dateText(view.modified, locale)].filter(Boolean).join(' · ') : '');
  const location = $derived(view?.location ? [view.location.collection, ...(view.location.folder ? view.location.folder.split('/') : [])].join(' / ') : '');
  const problemFacts = $derived(
    view && texts.editor
      ? [
          view.fileid ? fill(texts.editor.fileid, { fileid: view.fileid }) : '',
          view.seenAt ? fill(texts.editor.lastSeen, { date: dateText(view.seenAt, locale) }) : '',
          texts.editor.nodeKept,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  );
  // From the editor, links open in a new tab, never in its place.
  const linkTarget = $derived(mode === 'editor' ? '_blank' : undefined);

  const shown = $derived(
    status === 'unconfigured' && texts.editor
      ? 'unconfigured'
      : status === 'loading'
        ? 'loading'
        : reason && texts.editor && view
          ? 'problem'
          : status === 'access' && view?.access && view.access !== 'unavailable'
            ? 'access'
            : status !== 'ready' || !view
              ? 'unavailable'
              : 'file'
  );

  const placeholder = $derived.by((): DocumentPlaceholder | null => {
    if (shown === 'unconfigured') return { glyph: 'file', status: false, body: texts.editor?.unconfigured ?? '' };
    if (shown === 'problem' && reason && texts.editor) {
      return { glyph: 'alert-triangle', tone: 'warning', editor: true, status: true, title: texts.editor.reasons[reason], name: filename, body: problemFacts };
    }
    if (shown === 'access' && view?.access) {
      const renew = view.access === 'renew';
      return {
        glyph: 'cloud',
        status: true,
        title: renew ? texts.access.renewTitle : texts.access.connectTitle,
        name: filename || undefined,
        body: renew ? texts.access.renewBody : texts.access.connectBody,
        // A full navigation, under the connections page's own CSP (platform/cspRoutes.ts).
        action: view.connectHref ? { label: renew ? texts.access.renewAction : texts.access.connectAction, href: view.connectHref, target: linkTarget, reload: true } : undefined,
      };
    }
    if (shown === 'unavailable') return { glyph: 'file-off', status: true, title: filename || undefined, body: texts.unavailable };
    return null;
  });

  // The editor's repairs: check the file again, or choose another in its share or among the editor's own files.
  const repairs = $derived(
    !texts.editor || !view ? null : shown === 'problem' ? { other: !!view.collectionId } : shown === 'unavailable' && view.own ? { other: true } : null
  );

  const file = $derived.by((): DocumentEntryFile | null => {
    if (shown !== 'file' || !view) return null;
    return {
      title,
      glyph: fileGlyph(mime),
      preview: config.preview === 'auto' ? (showImage && view.content ? { image: view.content.view } : { tile: type ?? texts.genericType }) : null,
      chip: mode === 'editor' ? texts.documentChip : null,
      facts: config.showMeta ? facts : '',
      location: config.showMeta && location ? { glyph: 'cloud', text: location } : null,
      link:
        mode === 'page' && view.content
          ? { href: view.content.view, target: inline ? '_blank' : undefined, rel: inline ? 'noopener' : undefined, download: inline ? undefined : filename }
          : null,
      nodeLink: config.showNodeLink ? { label: texts.openNode, href: view.href } : null,
      download: config.showDownload && view.content ? { label: texts.download, href: view.content.download, filename } : null,
      linkTarget,
    };
  });

  async function check() {
    if (!editing || checking) return;
    checking = true;
    const ok = await editing.check();
    checking = false;
    if (!ok) toast.error(texts.editor?.checkFailed ?? '');
  }

  async function rebind(choice: TreeChoice) {
    if (!editing) return;
    if (!(await editing.rebind(choice))) toast.error(texts.editor?.rebindFailed ?? '');
  }
</script>

{#snippet repairActions()}
  <Button size="sm" variant="secondary" loading={checking} onclick={check}>{texts.editor?.check ?? ''}</Button>
  {#if repairs?.other}
    <Button size="sm" variant="secondary" onclick={() => (browsing = true)}>{texts.editor?.chooseOther ?? ''}</Button>
  {/if}
{/snippet}

<DocumentEntry
  {status}
  {mode}
  variant={config.variant}
  class={className}
  loading={shown === 'loading'}
  {placeholder}
  placeholderActions={repairs ? repairActions : undefined}
  {file}
  {...rest}
/>

{#if browsing && view && (view.collectionId || view.own)}
  <TreeBrowser
    open={browsing}
    source={view.own ? { kind: 'own' } : { kind: 'collection', collectionId: view.collectionId }}
    select="file"
    title={texts.editor?.browserTitle ?? ''}
    description={texts.editor?.browserDescription ?? ''}
    chooseLabel={texts.editor?.browserChoose ?? ''}
    onOpenChange={(open) => (browsing = open)}
    onChoose={rebind}
  />
{/if}
