<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The table, for the NodeView and the page. In the editor the <tbody>
  // is ProseMirror's to fill and no Svelte node may end up inside it, so the
  // mode is decided outside it. No island: a table has no page behaviour.
  import { groupClass } from '../catalog';
  import TableHandles from './TableHandles.svelte';
  import type { TableEditing } from './view';

  let {
    tableRuleId = '',
    columns = [],
    rowsHtml = null,
    editing = null,
  }: {
    /** The table's rule in the surface's stylesheet, '' for none. */
    tableRuleId?: string;
    /** Each column's rule (its width), in order. */
    columns?: string[];
    /** Null in the editor, where ProseMirror fills the body. */
    rowsHtml?: string | null;
    editing?: TableEditing | null;
  } = $props();

  const tableClass = `table-block-table ${groupClass('table')}`;
  let wrap: HTMLElement | undefined = $state();
  let table: HTMLTableElement | undefined = $state();
</script>

<!-- No whitespace inside the table: text is no child a <table> or a <colgroup> may have. -->
{#snippet tableElement()}
  <table class={tableClass} data-b={tableRuleId || undefined} bind:this={table}><colgroup>{#each columns as ruleId, i (i)}<col data-b={ruleId || undefined} />{/each}</colgroup>{#if rowsHtml == null}<tbody data-table-body></tbody>{:else if rowsHtml}<tbody>{@html rowsHtml}</tbody>{/if}</table>
{/snippet}

<!-- None beside it in the wrap: the editor's pre-wrap would draw it as a line. -->
{#if rowsHtml == null}
  <div class="table-block-content-wrap" bind:this={wrap}>{@render tableElement()}{#if editing && table && wrap}<TableHandles {editing} {table} {wrap} {columns} />{/if}</div>
{:else}
  {@render tableElement()}
{/if}
