<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A plain positioned element, not a bits-ui overlay: a virtual anchor is
  // measured only as it opens, and this card must follow a node still settling.
  import { Button, Badge } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { NodeType } from '$lib/features/nodes';

  let {
    title,
    href,
    type,
    className = null,
    namespaceName = null,
    connections,
    x,
    y,
    flip = false,
    onClose,
  }: {
    title: string;
    href: string;
    type: NodeType;
    className?: string | null;
    namespaceName?: string | null;
    connections: number;
    // In the wrapper's CSS pixels: the node's bottom centre, or its top centre when flipped.
    x: number;
    y: number;
    flip?: boolean;
    onClose: () => void;
  } = $props();
</script>

<div class="node-card" class:flip style:left="{x}px" style:top="{y}px" role="dialog" aria-label={title}>
  <div class="node-card-head">
    <a class="node-card-title" {href}>{title}</a>
    <Button type="button" variant="ghost" size="sm" icon aria-label={m.graph_node_card_close()} title={m.graph_node_card_close()} onclick={onClose}><Icon name="x" size={14} /></Button>
  </div>
  <dl class="node-card-meta">
    <div><dt>{m.graph_panel_filter_type()}</dt><dd><Badge tone={type === 'document' ? 'info' : 'accent'}>{type === 'document' ? m.graph_view_legend_document() : type === 'collection' ? m.graph_view_legend_collection() : m.graph_view_legend_page()}</Badge></dd></div>
    {#if className}<div><dt>{m.graph_panel_filter_class()}</dt><dd>{className}</dd></div>{/if}
    {#if namespaceName}<div><dt>{m.graph_panel_filter_namespace()}</dt><dd>{namespaceName}</dd></div>{/if}
    <div><dt>{m.graph_node_card_connections()}</dt><dd>{connections}</dd></div>
  </dl>
  <div class="node-card-actions">
    <Button variant="primary" size="sm" {href}>{m.graph_node_card_open()}</Button>
    <span class="node-card-hint">{m.graph_node_card_hint()}</span>
  </div>
</div>

<style>
  .node-card {
    position: absolute;
    z-index: 4;
    width: 240px;
    box-sizing: border-box;
    transform: translate(-50%, 10px);
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.6rem 0.7rem;
    font-size: var(--ds-text-sm);
    color: var(--ds-color-fg);
  }
  .node-card.flip { transform: translate(-50%, calc(-100% - 10px)); }
  .node-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.4rem; }
  .node-card-title {
    font-weight: var(--ds-weight-semibold);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .node-card-title:hover { color: var(--ds-color-accent); }
  .node-card-meta { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.6rem; margin: 0.5rem 0; }
  .node-card-meta > div { display: contents; }
  .node-card-meta dt { color: var(--ds-color-muted); }
  .node-card-meta dd { margin: 0; overflow-wrap: anywhere; }
  .node-card-actions { display: flex; align-items: center; gap: 0.6rem; }
  .node-card-hint { color: var(--ds-color-muted); font-size: var(--ds-text-xs); }
</style>
