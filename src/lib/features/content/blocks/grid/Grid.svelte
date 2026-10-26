<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The grid's row, also the page section's and the query template's.
  // In the editor the row is ProseMirror's to fill and no Svelte node may end
  // up inside it, so the mode is decided outside the row. The handles come in
  // with `editing`, so the page never loads them.
  import { groupClass } from '../catalog';
  import type { GridEditing } from './view';

  let {
    section = false,
    ruleId = '',
    reflow = '',
    columns = '',
    cellsHtml = null,
    editing = null,
    blockId = null,
    cellsKey = '',
  }: {
    section?: boolean;
    /** The row's rule in the surface's stylesheet, '' for none. */
    ruleId?: string;
    /** The tiers its cells reflow at (grid.css). */
    reflow?: string;
    /** A section's 'single' column. */
    columns?: string;
    /** Null in the editor, where ProseMirror fills the row. */
    cellsHtml?: string | null;
    editing?: GridEditing | null;
    blockId?: string | null;
    /** The cells' places: a change re-measures the handles. */
    cellsKey?: string;
  } = $props();

  const rowClass = $derived(
    section ? `grid page-section ${groupClass('pageSection')} cap-spacing cap-surface cap-height` : `grid ${groupClass('grid')} cap-spacing cap-surface cap-height`
  );
  const rowAttrs = $derived({
    class: rowClass,
    'data-page-section': section ? '' : undefined,
    'data-reflow': reflow || undefined,
    'data-columns': columns || undefined,
    'data-b': ruleId || undefined,
  });
  let row: HTMLElement | undefined = $state();
</script>

<!-- No whitespace inside or beside the row: its children are ProseMirror's,
     and the editor's pre-wrap would draw a space as a line of its own. -->
{#if cellsHtml == null}
  <div {...rowAttrs} bind:this={row}></div>{#if editing && row}{@const Handles = editing.handles}<Handles {editing} {row} {blockId} {cellsKey} {ruleId} />{/if}
{:else}
  <div {...rowAttrs}>{@html cellsHtml}</div>
{/if}
