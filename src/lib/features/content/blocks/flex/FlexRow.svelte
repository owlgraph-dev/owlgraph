<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The flex row, for the NodeView and the page. In the editor the row is
  // ProseMirror's to fill and no Svelte node may end up inside it, so the mode
  // is decided outside the row. No island: a row has no page behaviour.
  import { groupClass } from '../catalog';

  let {
    ruleId = '',
    column = '',
    scroll = '',
    cellsHtml = null,
  }: {
    /** The row's rule in the surface's stylesheet, '' for none. */
    ruleId?: string;
    /** The tiers it runs as a column at (flex.css). */
    column?: string;
    /** The tiers it scrolls sideways at (app.css). */
    scroll?: string;
    /** Null in the editor, where ProseMirror fills the row. */
    cellsHtml?: string | null;
  } = $props();

  const rowClass = `flex ${groupClass('flexContainer')} cap-layout cap-spacing cap-surface cap-height`;
</script>

<!-- No whitespace inside the row: in the editor its children are ProseMirror's alone. -->
{#if cellsHtml == null}
  <div class={rowClass} data-column={column || undefined} data-scroll={scroll || undefined} data-b={ruleId || undefined}></div>
{:else}
  <div class={rowClass} data-column={column || undefined} data-scroll={scroll || undefined} data-b={ruleId || undefined}>{@html cellsHtml}</div>
{/if}
