<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script module lang="ts">
  export type TableColumn = {
    label: string;
    /** Any CSS width (e.g. '11rem', '20%'). Unset = share of the remainder. */
    width?: string;
    align?: 'start' | 'end';
    /** Keep the label for assistive tech only (e.g. an actions column). */
    hideLabel?: boolean;
  };
</script>

<script lang="ts">
  // The body uses TableRow and TableCell, which carry this family's scoped
  // styles. Column widths come from `columns` (`table-layout: fixed`), never
  // from content, so an edit can't shift the columns. A narrow screen scrolls
  // the table sideways inside its wrapper.
  import type { Snippet } from 'svelte';

  let {
    columns,
    minWidth = '40rem',
    ariaLabel,
    class: className = '',
    children,
  }: {
    columns: TableColumn[];
    minWidth?: string;
    ariaLabel?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="ds-table-scroll scroll-cue {className}">
  <table class="ds-table" style:min-width={minWidth} aria-label={ariaLabel}>
    <colgroup>
      {#each columns as col, i (i)}
        <col style:width={col.width} />
      {/each}
    </colgroup>
    <thead>
      <tr>
        {#each columns as col, i (i)}
          <th scope="col" class:ds-table-end={col.align === 'end'}>
            {#if col.hideLabel}<span class="ds-table-sr">{col.label}</span>{:else}{col.label}{/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {@render children?.()}
    </tbody>
  </table>
</div>

<style>
  /* Positioned, so the hidden header labels stay inside the scrolling box
     instead of widening the document. */
  .ds-table-scroll {
    position: relative;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ds-table {
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
  }
  th {
    height: 2.5rem;
    padding: 0 var(--ds-space-sm);
    text-align: left;
    vertical-align: middle;
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-medium);
    color: var(--ds-color-muted);
    border-bottom: 1px solid var(--ds-color-border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ds-table-end { text-align: right; }
  .ds-table-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
