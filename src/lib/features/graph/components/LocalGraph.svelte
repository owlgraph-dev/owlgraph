<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import GraphView from './GraphView.svelte';
  import Icon from '$lib/design-system/Icon.svelte';
  import { Button, EmptyState } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { localGraphOpen, localGraphWidth } from '../localGraphStore';
  import type { GraphNode, GraphEdge } from '../types';

  let {
    nodes = [],
    edges = [],
    focusId = null,
  }: {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    focusId?: string | null;
  } = $props();

  const hasNeighbors = $derived(nodes.length > 1); // centre + at least one neighbour

  const MIN_W = 280;
  const MAX_W = 640;
  let resizing = $state(false);

  function startResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function moveResize(e: PointerEvent) {
    if (!resizing) return;
    // Panel is anchored to the right edge: width grows as the pointer moves left.
    localGraphWidth.set(Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - e.clientX)));
  }
  function endResize(e: PointerEvent) {
    resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }
</script>

{#if $localGraphOpen}
  <aside class="lg-panel" class:resizing aria-label={m.local_graph_aria_label()} style:--lg-w="{$localGraphWidth}px">
    <div
      class="lg-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={m.local_graph_resize_aria()}
      onpointerdown={startResize}
      onpointermove={moveResize}
      onpointerup={endResize}
    ></div>
    <header class="lg-head">
      <span>{m.local_graph_connections_heading()}</span>
      <Button
        variant="ghost"
        size="sm"
        icon
        href="/graph"
        class="lg-head-action"
        title={m.local_graph_open_full_graph_title()}
        aria-label={m.local_graph_open_full_graph_title()}
      ><Icon name="graph" /></Button>
      <!-- Closing is the edge tab's job, except on phones, where the tab is hidden. -->
      <Button
        variant="ghost"
        size="sm"
        icon
        class="lg-close"
        title={m.local_graph_close_aria()}
        aria-label={m.local_graph_close_aria()}
        onclick={() => ($localGraphOpen = false)}
      ><Icon name="x" /></Button>
    </header>
    <div class="lg-body">
      {#if hasNeighbors}
        <GraphView {nodes} {edges} {focusId} fill chrome="minimal" />
      {:else}
        <EmptyState size="sm" layout="centered">{m.local_graph_empty()}</EmptyState>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .lg-panel {
    position: fixed; top: var(--appbar-top-h); right: 0; bottom: 0; width: var(--lg-w, 360px); z-index: 20;
    display: flex; flex-direction: column;
    background: var(--ds-color-bg); border-left: 1px solid var(--ds-color-border);
  }
  /* The graph must not take the pointer from a resize drag. */
  .lg-panel.resizing :global(.graph) { pointer-events: none; }

  .lg-resize {
    position: absolute; left: -3px; top: var(--appbar-top-h); bottom: 0; width: 7px; z-index: 1;
    cursor: ew-resize; touch-action: none; user-select: none;
  }
  .lg-resize:hover { background: linear-gradient(to right, transparent, var(--ds-color-accent-soft)); }

  .lg-head {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--ds-color-border);
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ds-color-muted);
  }
  .lg-head :global(.lg-head-action) { margin-left: auto; }
  .lg-head :global(.lg-close) { display: none; }
  .lg-body { flex: 1; min-height: 0; position: relative; }

  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    /* The app bar moves to the bottom on phones: clear it there instead. */
    .lg-panel { width: 100%; top: 0; bottom: calc(var(--appbar-h) + env(safe-area-inset-bottom)); }
    .lg-resize { display: none; top: 0; }
    .lg-head :global(.lg-close) { display: inline-flex; }
  }
</style>
