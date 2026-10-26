<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The table's editor-only resize handles, laid over the cells by
  // measurement. Geometry that changes every frame is why they carry
  // `style:`, the editor-chrome exception (docs/architecture/blocks/anatomy.md).
  import { startDragResize, previewWeights, MIN_TRACK_PERCENT } from '../shared/gridResize';
  import { columnWeights } from './model';
  import type { TableEditing } from './view';
  import { liveNodeOf, pointerHandle } from '../scaffold/handles';

  let {
    editing,
    table,
    wrap,
    columns,
  }: {
    editing: TableEditing;
    table: HTMLTableElement;
    /** The scroller the handles are positioned in — they scroll with the table. */
    wrap: HTMLElement;
    /** The columns' rule ids: a change means the columns moved without the table resizing. */
    columns: string[];
  } = $props();

  const MIN_ROW_PX = 20;
  const MAX_ROW_PX = 2000;

  let colLefts = $state<number[]>([]);
  let rowTops = $state<number[]>([]);
  let layerWidth = $state(0);
  let dragging = $state<'col' | 'row' | null>(null);
  let active = $state(-1);

  const liveNode = () => liveNodeOf(editing);

  function measure() {
    if (dragging) return;
    const tn = liveNode();
    if (!tn) return;
    const origin = wrap.getBoundingClientRect();
    const cols = tn.childCount ? tn.child(0).childCount : 0;
    const firstRow = table.rows[0];
    const lefts: number[] = [];
    if (firstRow && firstRow.cells.length >= cols) {
      for (let k = 0; k < cols - 1; k++) {
        const a = firstRow.cells[k].getBoundingClientRect();
        const b = firstRow.cells[k + 1].getBoundingClientRect();
        lefts.push((a.right + b.left) / 2 - origin.left);
      }
    }
    colLefts = lefts;
    rowTops = Array.from(table.rows, (r) => r.getBoundingClientRect().bottom - origin.top);
    // The whole table, not the visible part: a wide table scrolls in its block.
    layerWidth = table.getBoundingClientRect().width;
  }

  // A column change is measured a frame later, once its rules are in the
  // editor's live sheet.
  $effect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  });
  $effect(() => {
    void columns;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });

  const settle = () => {
    dragging = null;
    active = -1;
    editing.editor.view.focus();
    requestAnimationFrame(measure);
  };

  function dispatchAttrs(pos: number, attrs: Record<string, unknown>, history: boolean) {
    const tr = editing.editor.state.tr.setNodeMarkup(pos, undefined, attrs);
    if (!history) tr.setMeta('addToHistory', false);
    editing.editor.view.dispatch(tr);
  }

  // table.css's --table-col-min, in px.
  function readableColumnPx(): number {
    const value = getComputedStyle(table).getPropertyValue('--table-col-min').trim();
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return 104;
    if (value.endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (value.endsWith('em')) return n * parseFloat(getComputedStyle(table).fontSize);
    return n;
  }

  function startColumnDrag(e: PointerEvent, k: number) {
    const tn = liveNode();
    if (!tn) return;
    const w0 = columnWeights(tn.attrs.columnWidths, tn.child(0).childCount);
    const firstRow = table.rows[0];
    if (k + 1 >= w0.length || !firstRow) return;
    const a = firstRow.cells[k].getBoundingClientRect();
    const b = firstRow.cells[k + 1].getBoundingClientRect();
    const spanLeft = a.left;
    const spanW = b.right - a.left;
    if (spanW <= 0) return;
    const origin = wrap.getBoundingClientRect();
    // Below a readable share the table's min width, and the table, would grow;
    // so a table that fits keeps fitting, and a wider one grows no wider.
    const minPercent = Math.max(MIN_TRACK_PERCENT, (readableColumnPx() / table.getBoundingClientRect().width) * 100);
    startDragResize(e, e.currentTarget as HTMLElement, w0, {
      computeNext: (ev) => previewWeights(w0, k, (ev.clientX - spanLeft) / spanW, minPercent),
      apply: (columnWidths, history) => {
        const pos = editing.getPos();
        const node = liveNode();
        if (typeof pos === 'number' && node) dispatchAttrs(pos, { ...node.attrs, columnWidths }, history);
      },
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
    const tn = liveNode();
    if (!tn || i >= table.rows.length) return;
    const startHeight = table.rows[i].getBoundingClientRect().height;
    const startY = e.clientY;
    const origin = wrap.getBoundingClientRect();
    startDragResize(e, e.currentTarget as HTMLElement, tn.child(i).attrs.height ?? Math.round(startHeight), {
      computeNext: (ev) => Math.max(MIN_ROW_PX, Math.min(MAX_ROW_PX, Math.round(startHeight + (ev.clientY - startY)))),
      apply: (height, history) => {
        const node = liveNode();
        const start = editing.getPos();
        if (!node || typeof start !== 'number' || i >= node.childCount) return;
        let pos = start + 1;
        for (let j = 0; j < i; j++) pos += node.child(j).nodeSize;
        dispatchAttrs(pos, { ...node.child(i).attrs, height }, history);
      },
      positionHandle: (ev) => {
        rowTops[i] = Math.max(0, Math.min(origin.height, ev.clientY - origin.top));
      },
      onStart: () => {
        dragging = 'row';
        active = i;
      },
      onSettled: settle,
    });
  }
</script>

<!-- Back to back: the editor's pre-wrap would draw a space between them as a line. -->
<div class="table-block-dividers" contenteditable="false">
  {#each colLefts as left, k (k)}
    <div class="table-block-divider" class:active={dragging === 'col' && active === k} style:left="{left}px" {@attach pointerHandle(startColumnDrag, k)}></div>
  {/each}
</div><div class="table-block-row-dividers" contenteditable="false" style:width="{layerWidth}px">
  {#each rowTops as top, i (i)}
    <div class="table-block-row-divider" class:active={dragging === 'row' && active === i} style:top="{top}px" {@attach pointerHandle(startRowDrag, i)}></div>
  {/each}
</div>

<style>
  /* Only the handles take the pointer. */
  .table-block-dividers,
  .table-block-row-dividers {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
  }
  /* Clips the last row handle's lower half, which hangs below the table. */
  .table-block-row-dividers {
    overflow: hidden;
  }
  .table-block-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 11px;
    transform: translateX(-50%);
    cursor: col-resize;
    pointer-events: auto;
  }
  .table-block-row-divider {
    position: absolute;
    left: 0;
    right: 0;
    height: 11px;
    transform: translateY(-50%);
    cursor: row-resize;
    pointer-events: auto;
  }
  .table-block-divider::before,
  .table-block-row-divider::before {
    content: '';
    position: absolute;
    background: transparent;
    border-radius: 2px;
    transition: background 0.12s;
  }
  .table-block-divider::before {
    left: 50%;
    top: 0.3rem;
    bottom: 0.3rem;
    width: 2px;
    transform: translateX(-50%);
  }
  .table-block-row-divider::before {
    top: 50%;
    left: 0.3rem;
    right: 0.3rem;
    height: 2px;
    transform: translateY(-50%);
  }
  .table-block-divider:hover::before,
  .table-block-divider.active::before,
  .table-block-row-divider:hover::before,
  .table-block-row-divider.active::before {
    background: var(--ds-color-accent);
  }
</style>
