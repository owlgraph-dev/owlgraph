<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Button } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { ClassFields } from '$lib/features/semantic';
  import OpenExternalButton from './OpenExternalButton.svelte';
  import { externalHost, type DocumentSource } from '../externalUrl';
  import { formatFileSize, documentContentPath } from '../client';

  let {
    doc,
    tags,
    manualProperties,
    classFields,
  }: {
    doc: {
      id: string;
      title: string;
      slug: string;
      namespace_slug: string | null;
      source: DocumentSource;
      external_url: string | null;
      filename: string;
      mime: string | null;
      size: number | null;
      visibility: string;
      locale?: string;
    };
    tags: string[];
    manualProperties: { name: string; value: string }[];
    // Its group's definitions decide which properties render as metadata here.
    classFields: ClassFields | null;
  } = $props();

  function visibilityLabel(v: string): string {
    if (v === 'public') return m.document_visibility_public();
    if (v === 'internal') return m.document_visibility_internal();
    return m.document_visibility_restricted();
  }

  const classProperties = $derived(
    (classFields?.definitions ?? [])
      .map((d) => ({ name: d.name, label: d.label, datatype: d.datatype, value: manualProperties.find((p) => p.name === d.name)?.value ?? '' }))
      .filter((p) => p.value !== '')
  );
  const shortProperties = $derived(classProperties.filter((p) => p.datatype !== 'longtext'));
  const longProperties = $derived(classProperties.filter((p) => p.datatype === 'longtext'));
</script>

<header class="doc-head">
  <!-- The title and field values are in the content language, the labels in the interface's (docs/architecture/languages.md). -->
  <h1 lang={doc.locale}>{doc.title}</h1>
  <dl class="meta">
    {#if classFields}
      <dt>{m.document_class_label()}</dt>
      <dd>
        {#if classFields.nodeClass.overviewPath}
          <a class="class-badge" href={classFields.nodeClass.overviewPath}>{classFields.nodeClass.label}</a>
        {:else}
          <span class="class-badge">{classFields.nodeClass.label}</span>
        {/if}
      </dd>
    {/if}
    {#each shortProperties as p (p.name)}
      <dt>{p.label}</dt><dd lang={doc.locale}>{p.value}</dd>
    {/each}
    {#if doc.source === 'link'}
      <dt>{m.document_external_label()}</dt><dd>{externalHost(doc.external_url ?? '')}</dd>
    {:else}
      <dt>{m.document_file_label()}</dt><dd>{doc.filename} · {doc.mime} · {formatFileSize(doc.size ?? 0)}</dd>
    {/if}
    <dt>{m.document_visibility_label()}</dt><dd><span class="vis vis-{doc.visibility}">{visibilityLabel(doc.visibility)}</span></dd>
  </dl>
  {#if tags.length > 0}
    <ul class="tags">
      {#each tags as tag (tag)}<li>{tag}</li>{/each}
    </ul>
  {/if}
  <div class="doc-actions">
    {#if doc.source === 'link'}
      <OpenExternalButton href={documentContentPath(doc.id)} externalUrl={doc.external_url} />
    {:else}
      <Button href={documentContentPath(doc.id)} target="_blank" rel="noopener">{m.document_view()}</Button>
      <Button href={documentContentPath(doc.id, { download: true })} download={doc.filename} variant="secondary">{m.document_download()}</Button>
    {/if}
  </div>
  {#each longProperties as p (p.name)}
    <section class="long-field">
      <h2>{p.label}</h2>
      <p lang={doc.locale}>{p.value}</p>
    </section>
  {/each}
</header>

<style>
  .doc-head { max-width: var(--canvas-read, var(--content-width-read)); margin-inline: auto; padding-inline: 1.5rem; box-sizing: border-box; }
  h1 { margin: 0 0 0.6rem; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.8rem; margin: 0 0 0.8rem; font-size: 0.9rem; }
  .meta dt { color: var(--ds-color-muted); }
  .meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .class-badge { display: inline-block; font-size: 0.78rem; background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-radius: var(--ds-radius-pill); padding: 0.15rem 0.6rem; text-decoration: none; }
  a.class-badge:hover { text-decoration: underline; }
  .tags { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.8rem; padding: 0; }
  .tags li { font-size: 0.78rem; background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-radius: var(--ds-radius-pill); padding: 0.15rem 0.6rem; }
  /* Edged in its own tone: the soft grounds sit near 1:1 on the page. */
  .vis { font-size: var(--ds-text-xs); font-weight: var(--ds-weight-medium); border-radius: var(--ds-radius-pill); padding: 0.05rem 0.5rem; border: 1px solid var(--ds-color-border); }
  .vis-public { background: var(--ds-color-success-soft); color: var(--ds-color-success); border-color: color-mix(in srgb, var(--ds-color-success) 25%, transparent); }
  .vis-internal { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); border-color: color-mix(in srgb, var(--ds-color-accent) 25%, transparent); }
  .vis-restricted { background: var(--ds-color-danger-soft); color: var(--ds-color-danger); border-color: color-mix(in srgb, var(--ds-color-danger) 25%, transparent); }
  .doc-actions { display: flex; gap: 0.5rem; }
  .long-field { margin-top: 1.5rem; }
  .long-field h2 { margin: 0 0 0.4rem; font-size: 0.95rem; }
  .long-field p { margin: 0; overflow-wrap: break-word; line-height: 1.5; color: var(--ds-color-fg); }
</style>
