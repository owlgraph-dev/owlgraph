<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One component for the editor's NodeView and the server-rendered page;
  // nothing hydrates (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). Its
  // links are plain links, checked for whoever follows them; a link document
  // shows its host, never its address.
  import { untrack } from 'svelte';
  import DocumentEntry from '../../listing/DocumentEntry.svelte';
  import { dateText, fileGlyph, opensInline, sizeText, typeLabel } from '../../listing/format';
  import type { DocumentEntryFile, DocumentPlaceholder } from '../../listing/types';
  import type { DocumentBlockProps } from './view';
  import type { DocumentBlockData } from './model';

  let { mode, config, initial, source = null, texts, locale, class: className = '', ...rest }: DocumentBlockProps = $props();

  let data = $state<DocumentBlockData | undefined>(untrack(() => initial));

  $effect(() => {
    const from = source;
    const id = config.nodeId;
    if (!from || !id) return;
    return untrack(() => from.watch(id, (next) => (data = next)));
  });

  const status = $derived(!config.nodeId ? 'unconfigured' : data === undefined ? (source ? 'loading' : 'unavailable') : data.state === 'file' ? 'ready' : data.state);
  const linkTarget = $derived(mode === 'editor' ? '_blank' : undefined);

  const placeholder = $derived.by((): DocumentPlaceholder | null => {
    if (status === 'unconfigured') return texts.editor ? { glyph: 'file', status: false, body: texts.editor.unconfigured } : { glyph: 'file-off', status: true, body: texts.unavailable };
    if (status === 'hidden') return { glyph: 'file-off', editor: !!texts.editor, status: true, body: texts.editor?.hidden ?? texts.unavailable };
    if (status === 'unavailable') {
      const node = data && data.state === 'unavailable' ? data.node : null;
      return { glyph: 'file-off', editor: !!texts.editor && !!node, status: true, title: node?.title, body: node && texts.editor ? texts.editor.provided : texts.unavailable };
    }
    return null;
  });

  const file = $derived.by((): DocumentEntryFile | null => {
    if (!data || data.state !== 'file') return null;
    const link = data.source === 'link';
    const filename = data.file?.filename ?? data.node.title;
    const title = (config.titleMode === 'auto' ? (config.variant === 'card' ? 'node' : 'filename') : config.titleMode) === 'node' ? data.node.title : filename;
    const mime = data.file?.mime ?? null;
    const type = link ? null : typeLabel(filename);
    const facts = link
      ? [title !== data.node.title ? data.node.title : '', texts.external].filter(Boolean).join(' · ')
      : [title !== filename ? filename : '', type ?? '', sizeText(data.file?.size ?? null, locale), dateText(data.modified, locale)].filter(Boolean).join(' · ');
    // An upload a browser can show opens in a tab, any other downloads; a link opens with no referrer.
    const inline = link || opensInline(mime);
    return {
      title,
      glyph: link ? 'link' : fileGlyph(mime),
      preview: config.preview === 'auto' ? { tile: link ? texts.linkType : (type ?? texts.genericType) } : null,
      chip: mode === 'editor' ? texts.chip : null,
      facts: config.showMeta ? facts : '',
      location: config.showMeta && link && data.linkHost ? { glyph: 'external-link', text: data.linkHost } : null,
      link:
        mode === 'page'
          ? { href: data.content.view, target: inline ? '_blank' : undefined, rel: link ? 'noopener noreferrer' : inline ? 'noopener' : undefined, download: inline ? undefined : filename }
          : null,
      nodeLink: config.showNodeLink ? { label: texts.openNode, href: data.node.href } : null,
      download: config.showDownload && data.content.download ? { label: texts.download, href: data.content.download, filename } : null,
      linkTarget,
    };
  });
</script>

<DocumentEntry {status} {mode} variant={config.variant} class={className} loading={status === 'loading'} {placeholder} {file} {...rest} />
