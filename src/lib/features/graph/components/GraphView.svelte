<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Dependency-free force-directed graph. The physics lives behind a
  // LayoutEngine (../layout); this component owns rendering, camera and interaction.
  import { onDestroy, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { MediaQuery } from 'svelte/reactivity';
  import { Badge, BottomSheet, Button, Tooltip, EmptyState } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { nodePath, type NodeType } from '$lib/features/nodes';
  import * as m from '$lib/paraglide/messages';
  import type { GraphNode, GraphEdge } from '../types';
  import { computeGroupHulls, type InflatableNode } from '../hull';
  import { VIEW_MODES, type ViewModeId } from '../layout/viewModes';
  import type { LayoutEngine } from '../layout/types';
  import { nodeRadius, truncateLabel, buildNeighbors } from '../nodeGeometry';
  import { computeFitTransform, FIT_MIN_SCALE, FIT_MAX_SCALE } from '../fit';
  import { DEFAULT_SETTINGS, loadSettings, saveSettings, type GraphSettings } from '../settings';
  import { activeFilterCount, applyGraphFilter, EMPTY_FILTER, isFilterEmpty, relationshipTypeItems, type GraphFilter } from '../graphFilter';
  import type { NodeClassOption } from '$lib/features/semantic';
  import type { NamespaceOption } from '$lib/features/query';
  import { hubNodeIds, labelOpacity } from '../labels';
  import { buildColorScheme } from '../nodeColor';
  import { UNIFORM_RADIUS } from '../nodeGeometry';
  import GraphPanel from './GraphPanel.svelte';
  import GraphNodeCard from './GraphNodeCard.svelte';
  import GraphLegend from './GraphLegend.svelte';

  let {
    nodes = [],
    edges = [],
    width = 760,
    height = 540,
    fill = false,
    focusId = null,
    chrome = 'full',
    storageKey = 'owlgraph.graph.global',
    classOptions = [],
    namespaces = [],
  }: {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    width?: number;
    height?: number;
    fill?: boolean; // fill the parent and track its measured size
    focusId?: string | null; // e.g. the current page in a local graph
    // 'full': the global graph (panel, stats, focus, node card); 'minimal': an
    // embedded neighbourhood (zoom/reset only, labels always on, click navigates).
    chrome?: 'full' | 'minimal';
    // Where 'full' remembers its display settings; 'minimal' persists nothing.
    storageKey?: string;
    classOptions?: NodeClassOption[];
    namespaces?: NamespaceOption[];
  } = $props();

  // Filters narrow the already viewer-scoped graph client-side; the object is
  // replaced on every change so the Sets inside stay plain.
  let filter = $state<GraphFilter>(EMPTY_FILTER);
  const visible = $derived(applyGraphFilter(nodes, edges, filter, classOptions));
  const visibleNodes = $derived(visible.nodes);
  const visibleEdges = $derived(visible.edges);
  const relationshipTypes = $derived(relationshipTypeItems(edges));
  const filtered = $derived(!isFilterEmpty(filter));
  const activeFilters = $derived(activeFilterCount(filter));
  const pageCount = $derived(nodes.filter((n) => (n.type ?? 'page') === 'page').length);
  const docCount = $derived(nodes.length - pageCount);

  // The chrome is fixed for a mounted view, so a snapshot, not a derivation.
  const minimal = untrack(() => chrome === 'minimal');
  // The consumer's defaults overlaid with what this browser remembered; filters are never persisted.
  const settingDefaults: GraphSettings = minimal ? { ...DEFAULT_SETTINGS, labels: 'always' } : DEFAULT_SETTINGS;
  let settings = $state<GraphSettings>(untrack(() => (minimal ? settingDefaults : loadSettings(storageKey, settingDefaults))));
  let panelOpen = $state(false);
  // A phone-width window shows the settings in a bottom sheet: the floating
  // panel would outgrow the screen there. One open state drives either.
  const phone = new MediaQuery('max-width: 640px');

  function updateSettings(patch: Partial<GraphSettings>) {
    settings = { ...settings, ...patch };
    if (!minimal) saveSettings(storageKey, settings);
  }

  // Colours are assigned over the whole graph so a filter never repaints the survivors.
  const colorScheme = $derived(
    buildColorScheme(settings.colorBy, nodes, {
      page: m.graph_view_legend_page(),
      document: m.graph_view_legend_document(),
      collection: m.graph_view_legend_collection(),
      other: m.graph_legend_other(),
      classLabel: (id) => classOptions.find((c) => c.id === id)?.label ?? null,
      classKey: (id) => classOptions.find((c) => c.id === id)?.slug ?? null,
      namespaceLabel: (id) => namespaces.find((ns) => ns.id === id)?.name ?? null,
    })
  );
  const legendEntries = $derived(colorScheme.legend(visibleNodes));
  const radiusOf = (deg: number) => (settings.nodeSize === 'uniform' ? UNIFORM_RADIUS : nodeRadius(deg));

  let measuredW = $state(0);
  let measuredH = $state(0);
  const W = $derived(fill && measuredW ? measuredW : width);
  const H = $derived(fill && measuredH ? measuredH : height);

  type P = GraphNode & { type: NodeType; x: number; y: number; deg: number };

  let sim = $state<P[]>([]);
  let hovered = $state<string | null>(null);
  // Sticky focus ('full' chrome): the node's neighbourhood stays highlighted
  // and the node card shows. Unrelated to the `focusId` prop.
  let selectedId = $state<string | null>(null);
  // Labelled at overview zoom. Degrees change only on init, so set there, not derived per frame.
  let hubs = $state<Set<string>>(new Set());
  // Set from the wide .edge-hit line (the visible line is too thin to hover);
  // drives the edge highlight and its tooltip.
  let hoveredEdgeIndex = $state<number | null>(null);
  let pos = $derived(new Map(sim.map((n) => [n.id, n])));
  let neighbors = new Map<string, Set<string>>();

  // Not $state: the physics writes the engine's internals every frame, and a
  // deep proxy would make each write a signal write. Swapped on a mode change.
  let engineMode: ViewModeId = untrack(() => settings.mode);
  let engine: LayoutEngine = VIEW_MODES[engineMode].createEngine();
  // `hasRealGroup` gates the hulls and dashed cross-group edges, so a graph
  // without a multi-node group renders plain. `groups` is read only by
  // `hulls`, which re-derives when `sim` changes.
  let groups: string[][] = [];
  let crossGroupEdges = $state<Set<number>>(new Set());
  let hasRealGroup = $state(false);
  let raf = 0;

  let hulls = $derived.by(() => {
    if (!hasRealGroup) return [];
    const nodesById = new Map<string, InflatableNode>(
      sim.map((n) => {
        const r = nodeRadius(n.deg);
        return [n.id, { x: n.x, y: n.y, r, bl: -r, br: r, bt: -r, bb: r }];
      })
    );
    return computeGroupHulls(nodesById, groups);
  });

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  // Auto-framing lasts through the settle until the user takes the camera or
  // a node; Reset turns it back on.
  let autoFit = $state(true);
  let svgEl = $state<SVGSVGElement | null>(null);
  let panning = $state(false);
  let moved = false;
  let panStart = { x: 0, y: 0, tx: 0, ty: 0 };
  let running = false;
  let dragId: string | null = null;
  let dragOffset = { dx: 0, dy: 0 };
  let nodeDown = { x: 0, y: 0 };

  // Ease toward the fit transform rather than snap, so the camera tracks the
  // settling layout without jitter.
  const FIT_SMOOTHING = 0.2;
  function fitTargets() {
    return sim.map((n) => ({ x: n.x, y: n.y, r: nodeRadius(n.deg) }));
  }
  function applyFit() {
    if (!autoFit || sim.length === 0) return;
    const fit = computeFitTransform(fitTargets(), W, H);
    scale += (fit.scale - scale) * FIT_SMOOTHING;
    tx += (fit.tx - tx) * FIT_SMOOTHING;
    ty += (fit.ty - ty) * FIT_SMOOTHING;
  }

  // The template and the interaction code read only `sim`/`pos`, never the engine.
  function syncPositions() {
    const positions = engine.positions();
    for (const n of sim) {
      const p = positions.get(n.id);
      if (p) { n.x = p.x; n.y = p.y; }
    }
  }

  function tick() {
    const active = engine.step();
    syncPositions();
    applyFit();
    if (active) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function init() {
    cancelAnimationFrame(raf);
    const layoutNodes = visibleNodes;
    const layoutEdges = visibleEdges;
    neighbors = buildNeighbors(layoutNodes, layoutEdges);

    // A filter or mode change nudges the survivors instead of re-scattering them.
    const seed = sim.length ? engine.positions() : undefined;
    if (engineMode !== settings.mode) {
      engineMode = settings.mode;
      engine = VIEW_MODES[engineMode].createEngine();
    }
    engine.setForces(settings.forces);
    engine.init(layoutNodes, layoutEdges, { w: W, h: H }, seed);
    groups = engine.groups();
    crossGroupEdges = engine.crossGroupEdgeIndices();
    hasRealGroup = groups.some((g) => g.length > 1);

    // Positioned before the first tick, so nodes don't flash unplaced.
    const initial = engine.positions();
    sim = layoutNodes.map((n) => {
      const p = initial.get(n.id) ?? { x: W / 2, y: H / 2 };
      return { ...n, type: n.type ?? 'page', x: p.x, y: p.y, deg: neighbors.get(n.id)?.size ?? 0 };
    });
    hubs = hubNodeIds(sim);
    if (selectedId && !neighbors.has(selectedId)) selectedId = null; // filtered away

    // Snap the first fit, so the initial paint is already framed.
    if (autoFit) {
      const fit = computeFitTransform(fitTargets(), W, H);
      scale = fit.scale; tx = fit.tx; ty = fit.ty;
    }

    running = true;
    // Not synchronously: tick() reads and writes `sim`, so running it inside
    // the effect that calls init() would re-run that effect forever.
    raf = requestAnimationFrame(tick);
  }

  // Re-init only when the filtered data or the mode changes, not on a resize
  // or a display setting: init runs untracked so reading W/H doesn't re-scatter.
  $effect(() => {
    const data = [visibleNodes, visibleEdges, settings.mode];
    void data;
    if (browser) untrack(() => init());
  });
  // Forces retune the running engine in place, never a re-init.
  $effect(() => {
    const forces = settings.forces;
    if (!browser) return;
    untrack(() => {
      engine.setForces(forces);
      if (sim.length) reheat(0.3);
    });
  });
  // A resize recentres gently instead of re-initialising.
  $effect(() => {
    const dims = [W, H];
    void dims;
    if (!browser) return;
    untrack(() => {
      engine.setViewport(W, H);
      if (sim.length) reheat(0.15);
    });
  });
  onDestroy(() => {
    if (browser) cancelAnimationFrame(raf);
  });

  function hrefOf(n: P): string {
    return nodePath(n.namespaceSlug, n.slug ?? '');
  }
  function open(n: P) {
    goto(hrefOf(n));
  }
  // 'minimal': a click navigates. 'full': a click focuses (set, never toggled,
  // so a double-click's two clicks don't undo each other); double-click and Enter open.
  function onNodeClick(n: P) {
    if (moved) return; // a pan-drag, not a click
    if (minimal) open(n);
    else selectedId = n.id;
  }
  function onNodeDblClick(n: P) {
    if (!minimal && !moved) open(n);
  }
  // A click on the empty canvas clears the focus; decided on pointerup, where a pan has already set `moved`.
  function clearSelectionOnCanvasClick(e: PointerEvent) {
    if (moved || minimal || e.type !== 'pointerup') return;
    if (!(e.target as Element | null)?.closest?.('.node')) selectedId = null;
  }
  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && selectedId) selectedId = null;
  }

  // A hover wins while it lasts, the sticky selection otherwise.
  const activeId = $derived(hovered ?? selectedId);
  const selected = $derived(selectedId ? (pos.get(selectedId) ?? null) : null);
  const selectedClassLabel = $derived(selected?.classId ? (classOptions.find((c) => c.id === selected.classId)?.label ?? null) : null);
  const selectedNamespaceName = $derived(selected?.namespaceId ? (namespaces.find((ns) => ns.id === selected.namespaceId)?.name ?? null) : null);
  // In the wrapper's CSS pixels. The card hangs below the node (its label sits
  // to the right) and flips above near the bottom edge.
  const selectedAnchor = $derived.by(() => {
    if (!selected || !svgEl) return null;
    const k = svgEl.clientWidth / W || 1;
    const r = nodeRadius(selected.deg) * scale * k;
    const sx = (selected.x * scale + tx) * k;
    const sy = (selected.y * scale + ty) * k;
    const flip = sy > svgEl.clientHeight * 0.6;
    return { x: sx, y: flip ? sy - r : sy + r, flip };
  });

  function clientToViewBox(clientX: number, clientY: number) {
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function clientToWorld(clientX: number, clientY: number) {
    const vb = clientToViewBox(clientX, clientY);
    return { x: (vb.x - tx) / scale, y: (vb.y - ty) / scale };
  }

  function reheat(a = 0.4) {
    engine.reheat(a);
    if (!running && browser) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  }

  function applyZoom(next: number, ax: number, ay: number) {
    autoFit = false;
    const s = Math.max(FIT_MIN_SCALE, Math.min(FIT_MAX_SCALE, next));
    // keep the anchor (viewBox coords) fixed under the cursor
    tx = ax - ((ax - tx) / scale) * s;
    ty = ay - ((ay - ty) / scale) * s;
    scale = s;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const { x, y } = clientToViewBox(e.clientX, e.clientY);
    applyZoom(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), x, y);
  }

  function startNodeDrag(e: PointerEvent, n: P) {
    e.stopPropagation(); // the background must not start a pan
    autoFit = false; // the camera must not rescale under the drag
    dragId = n.id;
    moved = false;
    nodeDown = { x: e.clientX, y: e.clientY };
    const w = clientToWorld(e.clientX, e.clientY);
    dragOffset = { dx: n.x - w.x, dy: n.y - w.y }; // so the node doesn't jump to the cursor
  }

  function dragNodeMove(e: PointerEvent) {
    if (!dragId || !svgEl) return;
    if (!moved) {
      // wait for a real drag before pinning, so a click still navigates
      if (Math.abs(e.clientX - nodeDown.x) + Math.abs(e.clientY - nodeDown.y) <= 3) return;
      moved = true;
      svgEl.setPointerCapture?.(e.pointerId);
      reheat(0.3);
    }
    const n = pos.get(dragId);
    if (!n) return;
    const w = clientToWorld(e.clientX, e.clientY);
    const worldX = w.x + dragOffset.dx;
    const worldY = w.y + dragOffset.dy;
    // Re-pinned on every move, so it tracks the cursor while the layout drifts;
    // the rendered position is written too, so there's no frame of lag.
    engine.pin(dragId, worldX, worldY);
    n.x = worldX; n.y = worldY;
  }

  function onPointerDown(e: PointerEvent) {
    // Capture only once a drag begins: capturing on pointerdown retargets the
    // click away from the node.
    autoFit = false;
    panning = true;
    moved = false;
    panStart = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onPointerMove(e: PointerEvent) {
    if (dragId) { dragNodeMove(e); return; }
    if (!panning || !svgEl) return;
    const sdx = e.clientX - panStart.x;
    const sdy = e.clientY - panStart.y;
    if (!moved && Math.abs(sdx) + Math.abs(sdy) > 3) {
      moved = true;
      svgEl.setPointerCapture?.(e.pointerId);
    }
    if (!moved) return;
    const rect = svgEl.getBoundingClientRect();
    tx = panStart.tx + sdx * (W / rect.width);
    ty = panStart.ty + sdy * (H / rect.height);
  }
  function onPointerUp(e: PointerEvent) {
    if (!dragId) clearSelectionOnCanvasClick(e);
    panning = false;
    dragId = null;
    if (svgEl?.hasPointerCapture?.(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
  }

  function resetView() {
    autoFit = true;
    engine.unpinAll();
    reheat(0.6);
  }
  function isDim(id: string): boolean {
    return !!activeId && activeId !== id && !neighbors.get(activeId)?.has(id);
  }
  function inFocus(id: string): boolean {
    return !!selectedId && (selectedId === id || !!neighbors.get(selectedId)?.has(id));
  }
  function edgeDimmed(e: GraphEdge): boolean {
    return !!activeId && activeId !== e.source && activeId !== e.target;
  }

  // Whether an edge label fits is checked every frame, but its width depends
  // only on the text, so it's measured once per label on a detached canvas.
  const labelWidthCache = new Map<string, number>();
  let measureCtx: CanvasRenderingContext2D | null = null;
  function measureLabelWidth(text: string): number {
    const cached = labelWidthCache.get(text);
    if (cached !== undefined) return cached;
    if (!browser) return text.length * 6; // SSR fallback
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      if (measureCtx) measureCtx.font = '10px system-ui, sans-serif'; // matches .edge-label
    }
    const w = measureCtx ? measureCtx.measureText(text).width : text.length * 6;
    labelWidthCache.set(text, w);
    return w;
  }

  // In world space, so the fit check doesn't depend on the zoom.
  const EDGE_LABEL_PADDING = 10;
  // Screen pixels: the .edge-hit line counter-scales against the zoom.
  const HIT_WIDTH_PX = 10;
  function edgeLabelFits(ax: number, ay: number, bx: number, by: number, text: string): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    return len >= measureLabelWidth(text) + EDGE_LABEL_PADDING;
  }
  // Keeps the label upright whichever way the edge points.
  function edgeLabelAngle(ax: number, ay: number, bx: number, by: number): number {
    const raw = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    if (raw > 90) return raw - 180;
    if (raw < -90) return raw + 180;
    return raw;
  }

  const hoveredEdge = $derived(hoveredEdgeIndex !== null ? visibleEdges[hoveredEdgeIndex] : null);
  // The edge midpoint in client coordinates. bits-ui places the tooltip
  // against `customAnchor` only as it opens, which is the moment that matters:
  // panning moves the cursor off the edge.
  const tooltipAnchor = $derived.by(() => {
    if (!hoveredEdge || !svgEl) return null;
    const a = pos.get(hoveredEdge.source);
    const b = pos.get(hoveredEdge.target);
    if (!a || !b) return null;
    const rect = svgEl.getBoundingClientRect();
    const worldX = (a.x + b.x) / 2;
    const worldY = (a.y + b.y) / 2;
    const screenX = rect.left + (worldX * scale + tx) * (rect.width / W);
    const screenY = rect.top + (worldY * scale + ty) * (rect.height / H);
    return { getBoundingClientRect: () => new DOMRect(screenX, screenY, 0, 0) };
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if nodes.length === 0}
  <EmptyState layout="centered">{m.graph_view_empty()}</EmptyState>
{:else}
  <div class="graph-wrap" class:fill bind:clientWidth={measuredW} bind:clientHeight={measuredH}>
    <div class="graph-controls">
      <Button type="button" variant="secondary" size="sm" icon title={m.graph_view_zoom_in()} aria-label={m.graph_view_zoom_in()} onclick={() => applyZoom(scale * 1.2, W / 2, H / 2)}>＋</Button>
      <Button type="button" variant="secondary" size="sm" icon title={m.graph_view_zoom_out()} aria-label={m.graph_view_zoom_out()} onclick={() => applyZoom(scale / 1.2, W / 2, H / 2)}>－</Button>
      <Button type="button" variant="secondary" size="sm" icon title={m.graph_view_reset()} aria-label={m.graph_view_reset()} onclick={resetView}>⟳</Button>
      {#if !minimal}
        <Button type="button" variant="secondary" size="sm" icon active={panelOpen} title={m.graph_panel_toggle()} aria-label={m.graph_panel_toggle()} aria-expanded={panelOpen} onclick={() => (panelOpen = !panelOpen)}><Icon name="sliders" size={16} /></Button>
      {/if}
    </div>
    {#if !minimal}
      <div class="graph-stats" class:filtered>
        {#if filtered}
          {m.graph_stats_filtered({ visible: visibleNodes.length, total: nodes.length, edges: visibleEdges.length })}
        {:else}
          {pageCount} {pageCount === 1 ? m.graph_stats_page() : m.graph_stats_pages()} · {docCount} {docCount === 1 ? m.graph_stats_document() : m.graph_stats_documents()} · {edges.length} {m.graph_stats_links()}
        {/if}
      </div>
    {/if}
    {#if !minimal && panelOpen && !phone.current}
      <div class="graph-panel-slot">
        <GraphPanel {settings} onSettings={updateSettings} {filter} onFilter={(next) => (filter = next)} {classOptions} {namespaces} {relationshipTypes} />
      </div>
    {/if}
    {#if !minimal}
      <BottomSheet
        open={panelOpen && phone.current}
        onOpenChange={(open) => (panelOpen = open)}
        title={m.graph_panel_toggle()}
        size="lg"
        closeLabel={m.graph_panel_close()}
      >
        {#snippet actions()}
          {#if activeFilters > 0}<Badge tone="accent">{m.graph_panel_filter_count({ count: activeFilters })}</Badge>{/if}
        {/snippet}
        <GraphPanel presentation="sheet" {settings} onSettings={updateSettings} {filter} onFilter={(next) => (filter = next)} {classOptions} {namespaces} {relationshipTypes} />
      </BottomSheet>
    {/if}
    <GraphLegend entries={legendEntries} />
    <svg
      bind:this={svgEl}
      viewBox="0 0 {W} {H}"
      class="graph"
      class:grabbing={panning}
      role="img"
      aria-label={m.graph_view_aria_label()}
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointerleave={onPointerUp}
    >
      <g transform="translate({tx} {ty}) scale({scale})">
        {#each hulls as h (h.groupIndex)}
          <path d={h.d} class="hull" style:--hull-color={h.color} />
        {/each}

        {#each visibleEdges as e, i (e.edgeId + '-' + i)}
          {@const a = pos.get(e.source)}
          {@const b = pos.get(e.target)}
          {#if a && b}
            {@const edgeDim = edgeDimmed(e)}
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              class="edge"
              class:dim={edgeDim}
              class:cross-group={hasRealGroup && crossGroupEdges.has(i)}
              class:typed={!!e.relationshipType}
              class:edge-hover={hoveredEdgeIndex === i}
              data-relationship-type={e.relationshipType}
            ></line>
            {#if e.relationshipLabel}
              <!-- A wide invisible hover target: the visible line goes sub-pixel
                at low zoom. Transparent, not none (none opts out of hit-testing). -->
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                class="edge-hit"
                stroke-width={HIT_WIDTH_PX / scale}
                aria-hidden="true"
                data-relationship-type={e.relationshipType}
                onmouseenter={() => (hoveredEdgeIndex = i)}
                onmouseleave={() => (hoveredEdgeIndex = null)}
              ></line>
            {/if}
            {#if settings.edgeLabels && e.relationshipLabel && edgeLabelFits(a.x, a.y, b.x, b.y, e.relationshipLabel)}
              <text
                class="edge-label"
                class:dim={edgeDim}
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2}
                dy="-3"
                text-anchor="middle"
                transform="rotate({edgeLabelAngle(a.x, a.y, b.x, b.y)} {(a.x + b.x) / 2} {(a.y + b.y) / 2})"
              >{e.relationshipLabel}</text>
            {/if}
          {/if}
        {/each}

        {#each sim as n (n.id)}
          {@const r = radiusOf(n.deg)}
          {@const labelAlpha = labelOpacity(settings.labels, { isHub: hubs.has(n.id), scale, inFocus: inFocus(n.id), hovered: hovered === n.id })}
          <g
            class="node"
            class:dim={isDim(n.id)}
            class:focus={n.id === focusId}
            class:selected={n.id === selectedId}
            style:--node-color={colorScheme.colorOf(n)}
            transform="translate({n.x},{n.y})"
            role="button"
            tabindex="0"
            aria-label={n.title}
            aria-pressed={minimal ? undefined : n.id === selectedId}
            onpointerdown={(e) => startNodeDrag(e, n)}
            onclick={() => onNodeClick(n)}
            ondblclick={() => onNodeDblClick(n)}
            onkeydown={(ev) => ev.key === 'Enter' && open(n)}
            onmouseenter={() => (hovered = n.id)}
            onmouseleave={() => (hovered = null)}
          >
            {#if n.type === 'document'}
              <rect x={-r} y={-r} width={2 * r} height={2 * r} rx="3" />
            {:else if n.type === 'collection'}
              <rect x={-r} y={-r} width={2 * r} height={2 * r} rx="2" transform="rotate(45)" />
            {:else}
              <circle r={r} />
            {/if}
            {#if labelAlpha > 0}
              <text x={r + 4} y="4" style:opacity={labelAlpha}>{truncateLabel(n.title)}</text>
            {/if}
          </g>
        {/each}
      </g>
    </svg>
    {#if selected && selectedAnchor}
      <GraphNodeCard
        title={selected.title}
        href={hrefOf(selected)}
        type={selected.type}
        className={selectedClassLabel}
        namespaceName={selectedNamespaceName}
        connections={selected.deg}
        x={selectedAnchor.x}
        y={selectedAnchor.y}
        flip={selectedAnchor.flip}
        onClose={() => (selectedId = null)}
      />
    {/if}
    <Tooltip
      open={!!hoveredEdge}
      onOpenChange={(o) => { if (!o) hoveredEdgeIndex = null; }}
      customAnchor={tooltipAnchor}
      side="top"
      sideOffset={8}
    >
      {#if hoveredEdge}
        <div class="edge-tooltip-label">{hoveredEdge.relationshipLabel}</div>
        {#if hoveredEdge.properties?.length}
          <dl class="edge-tooltip-props">
            {#each hoveredEdge.properties as p (p.name)}
              <div class="edge-tooltip-prop">
                <dt>{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            {/each}
          </dl>
        {/if}
      {/if}
    </Tooltip>
  </div>
{/if}

<style>
  .graph-wrap { position: relative; }
  .graph { width: 100%; height: auto; border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); background: var(--ds-color-bg); touch-action: none; cursor: grab; }
  .graph.grabbing { cursor: grabbing; }
  .graph-controls { position: absolute; top: 0.6rem; right: 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; z-index: 2; }
  .graph-stats {
    position: absolute; left: 0.6rem; top: 0.6rem; z-index: 2;
    font-size: var(--ds-text-sm); color: var(--ds-color-muted);
    background: var(--ds-color-bg); border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm); padding: 0.3rem 0.6rem;
  }
  .graph-stats.filtered { color: var(--ds-color-accent); border-color: var(--ds-color-accent); }
  /* A definite height, so the panel's max-height resolves and it scrolls inside. */
  .graph-panel-slot { position: absolute; top: 0.6rem; right: 3.2rem; bottom: 0.6rem; z-index: 3; display: flex; align-items: flex-start; pointer-events: none; }
  .graph-panel-slot > :global(*) { pointer-events: auto; }
  .hull { fill: var(--hull-color); fill-opacity: 0.12; stroke: var(--hull-color); stroke-opacity: 0.4; stroke-width: 1.5; pointer-events: none; }
  /* A hair darker than the border token, so edges read on the canvas. */
  .edge { stroke: var(--ds-color-border-hover); stroke-width: 1; transition: opacity 0.15s, stroke 0.1s, stroke-width 0.1s; }
  .edge.dim { opacity: 0.2; }
  .edge.cross-group { stroke-dasharray: 4 3; }
  .edge.edge-hover { stroke: var(--ds-color-accent); stroke-width: 2; }
  .edge-hit { stroke: transparent; pointer-events: stroke; }
  /* ui-check-allow: px — SVG text in user units: it scales with the graph's viewBox, not the page's rem */
  .edge-label { font-size: 10px; fill: var(--ds-color-muted); paint-order: stroke; stroke: var(--ds-color-bg); stroke-width: 3px; user-select: none; pointer-events: none; transition: opacity 0.15s; }
  .edge-label.dim { opacity: 0.2; }
  .edge-tooltip-label { font-weight: 600; }
  .edge-tooltip-props { margin: 0.3rem 0 0; }
  .edge-tooltip-prop { display: flex; gap: 0.4rem; justify-content: space-between; }
  .edge-tooltip-prop dt { color: var(--ds-color-muted, var(--ds-color-muted)); font-weight: 400; }
  .edge-tooltip-prop dd { margin: 0; font-weight: 500; }
  /* --node-color comes from nodeColor.ts. Hover and focus deepen whatever the
     colour is rather than swap to a fixed hue. */
  .node { cursor: pointer; transition: opacity 0.15s; }
  .node.dim { opacity: 0.25; }
  .node circle, .node rect { fill: var(--node-color, var(--ds-color-accent)); stroke: var(--ds-color-bg); stroke-width: 1.5; transition: filter 0.1s; }
  .node:hover circle, .node:focus-visible circle, .node:hover rect, .node:focus-visible rect { filter: var(--ds-filter-content-pressed); }
  .node.focus circle, .node.focus rect { stroke: var(--ds-color-accent); stroke-width: 3; }
  .node.focus text { font-weight: var(--ds-weight-semibold); }
  .node.selected circle, .node.selected rect { stroke: var(--ds-color-fg); stroke-width: 2.5; }
  .node.selected text { font-weight: var(--ds-weight-semibold); }
  /* ui-check-allow: px — SVG text in user units: it scales with the graph's viewBox, not the page's rem */
  .node text { font-size: 12px; fill: var(--ds-color-fg); paint-order: stroke; stroke: var(--ds-color-bg); stroke-width: 3px; user-select: none; transition: opacity 0.15s; }
  .graph-wrap.fill { width: 100%; height: 100%; }
  .graph-wrap.fill .graph { height: 100%; border: 0; border-radius: 0; }
</style>
