<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The header of a node's own page (docs/architecture/semantic-layer.md, "A node's page").
  // Presentation only: the read route resolves every word and prunes every
  // list for the viewer (NodeHeaderView).
  import { Badge, Button } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { NodeHeaderView } from '$lib/features/nodes';

  let { view }: { view: NodeHeaderView } = $props();

  const visibilityLabel = $derived(
    view.visibility === 'public' ? m.node_visibility_public() : view.visibility === 'internal' ? m.node_visibility_internal() : m.node_visibility_restricted()
  );
  const visibilityTone = $derived(view.visibility === 'public' ? 'success' : view.visibility === 'internal' ? 'accent' : 'danger');
  const sourceLabel = $derived(view.source ? [view.source.label, view.source.readsVia].filter(Boolean).join(' · ') : null);
  const hasFacts = $derived(view.properties.short.length > 0 || view.contains !== null || view.tags.length > 0);
  const hasMeta = $derived(hasFacts || view.properties.long.length > 0 || view.relationships.length > 0);
</script>

<header class="node-head">
  <nav class="crumbs" aria-label={m.node_breadcrumb()}>
    <span>{view.namespace}</span><span class="sep" aria-hidden="true">›</span><span class="current" aria-current="page" lang={view.locale}>{view.title}</span>
  </nav>

  <div class="title-row">
    <!-- The title and field values are in the node's language; the words around them in the interface's (docs/architecture/languages.md). -->
    <h1 lang={view.locale}>{view.title}</h1>
    {#if view.actions.length > 0}
      <div class="actions">
        {#each view.actions as action (action.id)}
          <Button size="sm" variant="secondary" href={action.href} target={action.external ? '_blank' : undefined} rel={action.external ? 'noopener noreferrer' : undefined}>{action.label}</Button>
        {/each}
      </div>
    {/if}
  </div>

  <ul class="chips">
    {#if view.nodeClass}
      <li title={m.node_class()}>
        {#if view.nodeClass.href}
          <a class="chip-link" href={view.nodeClass.href}><Badge tone="accent">{view.nodeClass.label}</Badge></a>
        {:else}
          <Badge tone="accent">{view.nodeClass.label}</Badge>
        {/if}
      </li>
    {/if}
    {#if sourceLabel}
      <li title={m.node_source()}><Badge tone="info">{sourceLabel}</Badge></li>
    {/if}
    <li title={m.node_visibility()}><Badge tone={visibilityTone}>{visibilityLabel}</Badge></li>
  </ul>

  <!-- One grid, so the labels share a column. -->
  {#if hasMeta}
    <div class="meta">
      {#if hasFacts}
        <dl>
          {#each view.properties.short as p (p.name)}
            <dt>{p.label}</dt>
            <dd lang={view.locale}>{p.value}</dd>
          {/each}
          {#if view.contains}
            <dt>{m.node_contains()}</dt>
            <dd>{view.contains}</dd>
          {/if}
          {#if view.tags.length > 0}
            <dt>{m.node_tags()}</dt>
            <dd>
              <ul class="tags">
                {#each view.tags as tag (tag)}<li><Badge>{tag}</Badge></li>{/each}
              </ul>
            </dd>
          {/if}
        </dl>
      {/if}

      {#each view.properties.long as p (p.name)}
        <section class="long">
          <h2>{p.label}</h2>
          <p lang={view.locale}>{p.value}</p>
        </section>
      {/each}

      {#if view.relationships.length > 0}
        <section class="relationships" aria-label={m.node_relationships()}>
          <dl>
            {#each view.relationships as group (group.key)}
              <dt>{group.label}</dt>
              <dd>
                <ul class="related">
                  {#each group.nodes as node (node.id)}
                    <li><a href={node.href}>{node.title}</a></li>
                  {/each}
                  {#if group.total > group.nodes.length}
                    <li class="more">{m.node_relationships_more({ count: group.total - group.nodes.length })}</li>
                  {/if}
                </ul>
              </dd>
            {/each}
          </dl>
        </section>
      {/if}
    </div>
  {/if}
</header>

<style>
  .node-head { display: flex; flex-direction: column; gap: var(--ds-space-sm); min-width: 0; }
  .crumbs { display: flex; flex-wrap: wrap; align-items: baseline; gap: calc(var(--ds-space-sm) / 2); font-size: var(--ds-text-sm); color: var(--ds-color-muted); overflow-wrap: anywhere; }
  .crumbs .current { color: var(--ds-color-fg); }
  .title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-sm) var(--ds-space-md); }
  h1 { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
  .chips, .tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: calc(var(--ds-space-sm) / 2) var(--ds-space-sm); }
  .chip-link { display: inline-flex; align-items: center; min-height: var(--ds-target-min); text-decoration: none; }
  .meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: calc(var(--ds-space-sm) / 2) var(--ds-space-md); font-size: var(--ds-text-md); }
  .meta dl, .relationships { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; row-gap: calc(var(--ds-space-sm) / 2); margin: 0; }
  .long { grid-column: 1 / -1; }
  dt { color: var(--ds-color-muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .long h2 { margin: var(--ds-space-sm) 0 calc(var(--ds-space-sm) / 2); font-size: var(--ds-text-md); }
  .long p { margin: 0; line-height: 1.5; overflow-wrap: break-word; }
  .related { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0 var(--ds-space-md); }
  .related a { display: inline-flex; align-items: center; min-height: var(--ds-target-min); overflow-wrap: anywhere; }
  .related .more { color: var(--ds-color-muted); }
</style>
