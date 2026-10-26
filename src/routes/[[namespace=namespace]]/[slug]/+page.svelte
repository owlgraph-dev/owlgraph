<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { RenderedContent } from '$lib/features/content/components';
  import { DocumentView } from '$lib/features/documents/components';
  import { CollectionNodeView } from '$lib/features/collections/components';
  import NodeHeader from '$lib/features/reader/routes/NodeHeader.svelte';
  import { styleNonceFor } from '$lib/platform/styleNonce';
  let { data } = $props();

  const headTitle = $derived(data.kind === 'page' ? data.title : data.kind === 'document' ? data.doc.title : data.kind === 'collection' ? data.collection.title : '');
</script>

<svelte:head>
  <title>{headTitle}</title>
  <!-- Every block's overrides as rules its `data-b` points into, under the
       style-src nonce (capabilities/pageStyles.ts, platform/csp.ts). -->
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
  <!-- The root layout renders the local graph panel, outside the page's scheme. -->
  <RenderedContent html={data.html} firstBlockBleeds={data.firstBlockBleeds} scheme={data.contentScheme} canvasRuleId={data.canvasRuleId} lang={data.locale} />

{:else if data.kind === 'document'}
  <DocumentView
    doc={data.doc}
    tags={data.tags}
    manualProperties={data.manualProperties}
    classFields={data.classFields}
  />

{:else if data.kind === 'collection'}
  <!-- One collection's page after another is a new page: nothing the last one's body held carries over. -->
  {#key data.collection.id}
    <NodeHeader view={data.header} />
    <CollectionNodeView collection={data.collection} members={data.members} source={data.source} canWrite={data.canEdit} />
  {/key}
{/if}
