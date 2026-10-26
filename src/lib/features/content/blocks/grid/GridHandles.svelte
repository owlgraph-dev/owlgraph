<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Editor-only construction handles (dividers, merge selection), laid over the
  // cells by measurement. Geometry that changes every frame is why they carry
  // `style:`, the editor-chrome exception (docs/architecture/blocks/anatomy.md). The dividers resize
  // the desktop's tracks, so they hide wherever the grid isn't drawn in those.
  import { untrack } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { Button } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { startDragResize, previewWeights } from '../shared/gridResize';
  import { editTier } from '../../capabilities/editTierStore';
  import { ownGridColumns } from './gridColumns';
  import { heightsOf, widthsOf } from './model';
  import { boundaryCellIndices, boxesOf, planMerge, rowsOf, selectionBoxOf, type CellBox } from './gridMath';
  import { mergeSelectFor } from './mergeSelect';
  import type { GridHandlesProps } from './view';
  import { frameScheduler, liveNodeOf, pointerHandle } from '../scaffold/handles';

  let { editing, row, blockId, cellsKey, ruleId }: GridHandlesProps = $props();

  const MIN_ROW_PX = 20;
  const MAX_ROW_PX = 2000;

  let layer: HTMLElement | undefined = $state();
  /** Per column boundary: where its divider sits, or null where a merge spans it in every row. */
  let colLefts = $state<(number | null)[]>([]);
  let rowTops = $state<number[]>([]);
  /** Whether the grid is drawn in its desktop columns — the only place the dividers resize. */
  let shown = $state(false);
  let dragging = $state<'col' | 'row' | null>(null);
  let active = $state(-1);
  let viewport = $state('desktop');
  let armed = $state(false);
  let highlight = $state<{ left: number; top: number; width: number; height: number; valid: boolean } | null>(null);
  let action = $state<{ left: number; top: number; unmerge: boolean; run: () => void } | null>(null);
  let selecting = false;
  let selStart = -1;
  let selEnd = -1;

  const liveNode = () => liveNodeOf(editing);
  const cellAttrsOf = (cn: any): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    cn.forEach((c: { attrs: Record<string, unknown> }) => out.push(c.attrs));
    return out;
  };
  const cellEls = () => [...row.children] as HTMLElement[];
  const tracks = (value: string) => value.split(' ').map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
  const colPx = () => tracks(getComputedStyle(row).gridTemplateColumns);
  const rowPx = () => tracks(getComputedStyle(row).gridTemplateRows);

  // Probed at a boundary, not the first two cells: a merged first cell
  // legitimately reaches past the second.
  function stacked(cols: number, boxes: CellBox[]): boolean {
    if (cols < 2) return false;
    const cells = cellEls();
    for (let k = 0; k < cols - 1; k++) {
      const b = boundaryCellIndices(boxes, k);
      if (!b || !cells[b.leftIdx] || !cells[b.rightIdx]) continue;
      return cells[b.rightIdx].getBoundingClientRect().left < cells[b.leftIdx].getBoundingClientRect().right;
    }
    return false;
  }

  function measure() {
    if (dragging || !layer) return;
    const cn = liveNode();
    if (!cn) return;
    const cols = widthsOf(cn).length;
    const boxes = boxesOf(cellAttrsOf(cn), cols);
    shown = !(stacked(cols, boxes) || colPx().length !== cols || (viewport !== 'desktop' && ownGridColumns(cn.attrs, viewport as 'tablet' | 'phone') != null));
    if (!shown) return;
    const origin = layer.getBoundingClientRect();
    const cells = cellEls();
    const lefts: (number | null)[] = [];
    for (let k = 0; k < cols - 1; k++) {
      const b = boundaryCellIndices(boxes, k);
      if (!b || !cells[b.leftIdx] || !cells[b.rightIdx]) {
        lefts.push(null);
        continue;
      }
      lefts.push((cells[b.leftIdx].getBoundingClientRect().right + cells[b.rightIdx].getBoundingClientRect().left) / 2 - origin.left);
    }
    colLefts = lefts;
    // Row floors are independent, so the last row has a divider too.
    const rows = rowsOf(boxes);
    const px = rowPx();
    if (px.length < rows || cells.length === 0) return;
    const gap = parseFloat(getComputedStyle(row).rowGap) || 0;
    let top = cells[0].getBoundingClientRect().top - origin.top;
    const tops: number[] = [];
    for (let k = 0; k < rows; k++) {
      top += px[k];
      tops.push(top + (k < rows - 1 ? gap / 2 : 0));
      top += gap;
    }
    rowTops = tops;
  }

  // Measured a frame later: a structural edit lands its cells first, and a
  // track change its rule in the editor's live sheet a microtask after.
  const { schedule, cancel: cancelFrames } = frameScheduler(() => measure());

  $effect(() => {
    const observer = new ResizeObserver(() => measure());
    observer.observe(row);
    return () => {
      observer.disconnect();
      cancelFrames();
    };
  });
  $effect(() => {
    void cellsKey;
    void ruleId;
    // The cells moved: an open selection's indices mean nothing any more.
    untrack(() => {
      clearSelection();
      schedule();
    });
  });
  $effect(() =>
    editTier.subscribe((vp) => {
      viewport = vp;
      untrack(schedule);
    })
  );
  $effect(() =>
    mergeSelectFor.subscribe((id) => {
      armed = id != null && id === blockId;
      if (!armed) untrack(clearSelection);
    })
  );

  const settle = () => {
    dragging = null;
    active = -1;
    editing.editor.view.focus();
    schedule();
  };

  function startColumnDrag(e: PointerEvent, k: number) {
    const cn = liveNode();
    if (!cn || !layer) return;
    const w0 = widthsOf(cn);
    const px = colPx();
    const cells = cellEls();
    if (k + 1 >= w0.length || px.length < w0.length || cells.length === 0) return;
    // From the track sizes: a cell at the boundary may span several columns.
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    let spanLeft = cells[0].getBoundingClientRect().left;
    for (let i = 0; i < k; i++) spanLeft += px[i] + gap;
    const spanW = px[k] + gap + px[k + 1];
    if (spanW <= 0) return;
    const origin = layer.getBoundingClientRect();
    startDragResize(e, e.currentTarget as HTMLElement, w0, {
      computeNext: (ev) => previewWeights(w0, k, (ev.clientX - spanLeft) / spanW),
      apply: (widths, history) => editing.setColumnWidths(widths, history),
      positionHandle: (ev) => {
        colLefts[k] = Math.max(0, Math.min(origin.width, ev.clientX - origin.left));
      },
      onStart: () => {
        dragging = 'col';
        active = k;
      },
      onSettled: settle,
    });
  }

  function startRowDrag(e: PointerEvent, i: number) {
    const cn = liveNode();
    const px = rowPx();
    if (!cn || !layer || i >= px.length) return;
    const startHeight = px[i];
    const startY = e.clientY;
    const h0: (number | null)[] = heightsOf(cn) ?? new Array(rowsOf(boxesOf(cellAttrsOf(cn), widthsOf(cn).length))).fill(null);
    startDragResize(e, e.currentTarget as HTMLElement, h0, {
      computeNext: (ev) => {
        const value = Math.max(MIN_ROW_PX, Math.min(MAX_ROW_PX, startHeight + (ev.clientY - startY)));
        return h0.map((v, idx) => (idx === i ? value : v));
      },
      apply: (heights, history) => editing.setRowHeights(heights, history),
      // Re-measured each move: a growing row grows the grid, the last one most.
      positionHandle: (ev) => {
        const origin = layer!.getBoundingClientRect();
        rowTops[i] = Math.max(0, Math.min(origin.height, ev.clientY - origin.top));
      },
      onStart: () => {
        dragging = 'row';
        active = i;
      },
      onSettled: settle,
    });
  }

  function cellIndexAt(x: number, y: number): number {
    return cellEls().findIndex((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  function clearSelection() {
    selecting = false;
    selStart = -1;
    selEnd = -1;
    highlight = null;
    action = null;
  }

  function showSelection() {
    const cn = liveNode();
    if (!cn || !layer || selStart < 0 || selEnd < 0) return;
    const attrs = cellAttrsOf(cn);
    if (selStart >= attrs.length || selEnd >= attrs.length) return clearSelection();
    const cols = widthsOf(cn).length;
    const boxes = boxesOf(attrs, cols);
    const box = selectionBoxOf(selStart, selEnd, boxes);
    const singleMerged = selStart === selEnd && (boxes[selStart].colSpan > 1 || boxes[selStart].rowSpan > 1);
    const valid = singleMerged || planMerge(attrs, cols, box) != null;
    const cells = cellEls();
    const a = cells[selStart].getBoundingClientRect();
    const b = cells[selEnd].getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    const left = Math.min(a.left, b.left) - origin.left;
    const top = Math.min(a.top, b.top) - origin.top;
    const right = Math.max(a.right, b.right) - origin.left;
    const bottom = Math.max(a.bottom, b.bottom) - origin.top;
    highlight = { left, top, width: right - left, height: bottom - top, valid };
    const index = selStart;
    action = valid
      ? {
          left: right,
          top: bottom,
          unmerge: singleMerged,
          run: () => (singleMerged ? editing.unmerge(index) : editing.merge(box)),
        }
      : null;
  }

  // Only while armed does the layer take the pointer, so a plain drag in a
  // cell is never a selection. Presses on the action reach its click.
  const selectLayer: Attachment<HTMLElement> = (node) => {
    const onAction = (e: Event) => !!(e.target as HTMLElement | null)?.closest('.grid-handle-select-action');
    const mousedown = (e: MouseEvent) => {
      if (!onAction(e)) e.preventDefault();
    };
    const pointerdown = (e: PointerEvent) => {
      if (!armed || onAction(e)) return;
      e.preventDefault();
      const idx = cellIndexAt(e.clientX, e.clientY);
      if (idx < 0) return clearSelection();
      selecting = true;
      selStart = idx;
      selEnd = idx;
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
      showSelection();
    };
    const pointermove = (e: PointerEvent) => {
      if (!selecting) return;
      const idx = cellIndexAt(e.clientX, e.clientY);
      if (idx >= 0) selEnd = idx;
      showSelection();
    };
    const pointerup = (e: PointerEvent) => {
      if (!selecting) return;
      selecting = false;
      try {
        node.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    node.addEventListener('mousedown', mousedown);
    node.addEventListener('pointerdown', pointerdown);
    node.addEventListener('pointermove', pointermove);
    node.addEventListener('pointerup', pointerup);
    return () => {
      node.removeEventListener('mousedown', mousedown);
      node.removeEventListener('pointerdown', pointerdown);
      node.removeEventListener('pointermove', pointermove);
      node.removeEventListener('pointerup', pointerup);
    };
  };
</script>

<div class="grid-handles" contenteditable="false" bind:this={layer}>
  {#if shown}
    <div class="grid-handle-dividers">
      {#each colLefts as left, k (k)}
        {#if left != null}
          <div class="grid-handle-divider" class:active={dragging === 'col' && active === k} style:left="{left}px" {@attach pointerHandle(startColumnDrag, k)}></div>
        {/if}
      {/each}
    </div>
    <div class="grid-handle-row-dividers">
      {#each rowTops as top, i (i)}
        <div class="grid-handle-row-divider" class:active={dragging === 'row' && active === i} style:top="{top}px" {@attach pointerHandle(startRowDrag, i)}></div>
      {/each}
    </div>
  {/if}
  <div class="grid-handle-select-layer" class:active={armed} {@attach selectLayer}>
    {#if highlight}
      <div
        class="grid-handle-select-highlight"
        class:invalid={!highlight.valid}
        style:left="{highlight.left}px"
        style:top="{highlight.top}px"
        style:width="{highlight.width}px"
        style:height="{highlight.height}px"
      ></div>
    {/if}
    {#if action}
      {@const run = action.run}
      <div class="grid-handle-select-action" style:left="{action.left}px" style:top="{action.top}px">
        <Button
          variant="primary"
          size="sm"
          onclick={() => {
            run();
            clearSelection();
          }}>{action.unmerge ? m.editor_grid_unmerge() : m.editor_grid_merge()}</Button
        >
      </div>
    {/if}
  </div>
</div>

<style>
  /* Only the handles and the armed selection take the pointer. */
  .grid-handles,
  .grid-handle-dividers,
  .grid-handle-row-dividers,
  .grid-handle-select-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .grid-handle-dividers,
  .grid-handle-row-dividers {
    z-index: 3;
  }
  .grid-handle-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 11px;
    transform: translateX(-50%);
    cursor: col-resize;
    pointer-events: auto;
  }
  .grid-handle-row-divider {
    position: absolute;
    left: 0;
    right: 0;
    height: 11px;
    transform: translateY(-50%);
    cursor: row-resize;
    pointer-events: auto;
  }
  .grid-handle-divider::before,
  .grid-handle-row-divider::before {
    content: '';
    position: absolute;
    background: transparent;
    border-radius: 2px;
    transition: background 0.12s;
  }
  .grid-handle-divider::before {
    left: 50%;
    top: 0.3rem;
    bottom: 0.3rem;
    width: 2px;
    transform: translateX(-50%);
  }
  .grid-handle-row-divider::before {
    top: 50%;
    left: 0.3rem;
    right: 0.3rem;
    height: 2px;
    transform: translateY(-50%);
  }
  .grid-handle-divider:hover::before,
  .grid-handle-divider.active::before,
  .grid-handle-row-divider:hover::before,
  .grid-handle-row-divider.active::before {
    background: var(--ds-color-accent);
  }
  .grid-handle-select-layer {
    z-index: 4;
  }
  .grid-handle-select-layer.active {
    pointer-events: auto;
    cursor: crosshair;
  }
  .grid-handle-select-highlight {
    position: absolute;
    border: 2px solid var(--ds-color-accent);
    background: var(--ds-color-accent-soft);
    opacity: 0.85;
    border-radius: var(--ds-radius-sm);
    pointer-events: none;
  }
  .grid-handle-select-highlight.invalid {
    border-color: var(--ds-color-danger);
    background: color-mix(in srgb, var(--ds-color-danger) 12%, transparent);
  }
  /* Below the selection's bottom-right corner, its right edges aligned. */
  .grid-handle-select-action {
    position: absolute;
    transform: translate(-100%, var(--ds-space-sm));
    z-index: 5;
    cursor: auto;
  }
</style>
