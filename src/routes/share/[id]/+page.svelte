<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { RenderedContent } from '$lib/features/content/components';
  import { styleNonceFor } from '$lib/platform/styleNonce';
  import * as m from '$lib/paraglide/messages';
  import { Button } from '$lib/design-system';
  import { OpenExternalButton } from '$lib/features/documents/components';
  import { externalHost, formatFileSize, documentContentPath } from '$lib/features/documents';
  let { data } = $props();

  const d = $derived(data.kind === 'document' ? data.doc : null);
  const headTitle = $derived(data.kind === 'page' ? data.title : (d?.title ?? ''));
</script>

<svelte:head>
  <title>{headTitle}</title>
  <!-- The per-page stylesheet (capabilities/pageStyles.ts), under the style-src nonce. -->
  {#if data.kind === 'page' && data.css}{@html `<style nonce="${styleNonceFor(data.styleNonce)}">${data.css}</style>`}{/if}
  <!-- The opening background, fetched before the stylesheet applies, one per
       canvas tier (content/blocks/image/leadImage.ts). -->
  {#if data.kind === 'page'}
    {#each data.imagePreloads as preload (preload.media)}
      <link rel="preload" as="image" href={preload.href} imagesrcset={preload.imagesrcset} media={preload.media} fetchpriority="high" />
    {/each}
  {/if}
</svelte:head>

{#if data.kind === 'page'}
  <!-- The root layout renders the local graph panel. -->
  <RenderedContent html={data.html} firstBlockBleeds={data.firstBlockBleeds} scheme={data.contentScheme} canvasRuleId={data.canvasRuleId} lang={data.locale} />

  <!-- The page's reading column and gutters: its own rule in the per-page
       stylesheet when it sets them, else the site's tokens. -->
  <div class="page-after" data-b={data.afterRuleId || undefined}>
    {#if data.referencedBy.length > 0}
      <aside class="referenced-by">
        <h2>{m.document_referenced_by_heading()}</h2>
        <ul>
          {#each data.referencedBy as bl (bl.id)}
            <li>{bl.title}</li>
          {/each}
        </ul>
      </aside>
    {/if}
  </div>
{:else if data.kind === 'document' && d}
  <header class="doc-head">
    <!-- The title is content: its language is the document's (docs/architecture/languages.md). -->
    <h1 lang={d.locale}>{d.title}</h1>
    <dl class="meta">
      {#if d.source === 'link'}
        <dt>{m.document_external_label()}</dt><dd>{externalHost(d.external_url ?? '')}</dd>
      {:else}
        <dt>{m.document_file_label()}</dt><dd>{d.filename} · {d.mime} · {formatFileSize(d.size ?? 0)}</dd>
      {/if}
    </dl>
    <div class="doc-actions">
      {#if d.source === 'link'}
        <OpenExternalButton href={documentContentPath(d.id, { shareId: data.shareId })} externalUrl={d.external_url} />
      {:else}
        <Button variant="primary" href={documentContentPath(d.id, { shareId: data.shareId })} target="_blank" rel="noopener">{m.document_view()}</Button>
        <Button href={documentContentPath(d.id, { shareId: data.shareId, download: true })} download={d.filename}>{m.document_download()}</Button>
      {/if}
    </div>
  </header>
{/if}

<style>
  /* Outside the canvas, so the tiers are the viewport's: the canvas's width here. */
  .page-after {
    --after-gutter: var(--canvas-gutter-d, var(--content-gutter-d));
    max-width: calc(var(--canvas-read, var(--content-width-read)) + 2 * var(--after-gutter));
    margin-inline: auto;
    padding-inline: var(--after-gutter);
    box-sizing: border-box;
  }
  @media (max-width: 900px) { .page-after { --after-gutter: var(--canvas-gutter-t, var(--content-gutter-t)); } }
  /* ui-check-allow: shell-media — the content gutter follows the canvas tiers, which are the window’s width here */
  @media (max-width: 640px) { .page-after { --after-gutter: var(--canvas-gutter-p, var(--content-gutter-p)); } }
  .referenced-by { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--ds-color-border); }
  .referenced-by h2 { font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); color: var(--ds-color-muted); }
  .referenced-by ul { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .referenced-by li { padding: 0.2rem 0; }

  .doc-head { max-width: var(--content-width-read); margin: 2rem auto; padding-inline: 1.5rem; box-sizing: border-box; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.8rem; margin: 0 0 0.8rem; font-size: 0.9rem; }
  .meta dt { color: var(--ds-color-muted); }
  .meta dd { margin: 0; }
  .doc-actions { display: flex; gap: 0.5rem; }
</style>
