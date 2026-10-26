<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // (docs/architecture/semantic-layer.md, "A node's page"). The body is a query container
  // named like the page canvas, so its listing folds for a phone as on a page;
  // the listing's stylesheet is imported here, the canvas's not being on this page.
  import '$lib/features/content/listing/entryList.css';
  import { invalidateAll } from '$app/navigation';
  import { Tabs, TabsContent, TabsTrigger } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { pluginNodeViews } from '$lib/plugins/nodeViews';
  import type { NodeSourceView } from '$lib/features/pluginHost';
  import MembersList from './MembersList.svelte';
  import type { CollectionMember } from '../types';

  let {
    collection,
    members,
    source,
    canWrite,
  }: {
    collection: { id: string; title: string; href: string };
    members: CollectionMember[];
    /** Null for a curated collection or an integration turned off. */
    source: NodeSourceView | null;
    canWrite: boolean;
  } = $props();

  const Body = $derived(source ? (pluginNodeViews(source.pluginId)?.collection ?? null) : null);
  let tab = $state('contents');
</script>

<div class="collection-body">
  {#if Body && source}
    <Tabs bind:value={tab} ariaLabel={m.collection_tabs()}>
      {#snippet tabs()}
        <TabsTrigger value="contents">{m.collection_tab_contents()}</TabsTrigger>
        <TabsTrigger value="linked">{m.collection_tab_linked({ count: members.length })}</TabsTrigger>
      {/snippet}
      <TabsContent value="contents">
        <div class="panel">
          <Body
            node={{ id: collection.id, type: 'collection', title: collection.title, href: collection.href }}
            {canWrite}
            data={source.data}
            locale={getLocale()}
            onChange={() => void invalidateAll()}
          />
        </div>
      </TabsContent>
      <TabsContent value="linked">
        <div class="panel">
          <MembersList {members} empty={m.collection_linked_empty()} />
        </div>
      </TabsContent>
    </Tabs>
  {:else}
    <MembersList {members} empty={m.collection_members_empty()} />
  {/if}
</div>

<style>
  .collection-body { container: canvas / inline-size; margin-top: var(--ds-space-lg); }
  .panel { padding-top: var(--ds-space-md); }
</style>
