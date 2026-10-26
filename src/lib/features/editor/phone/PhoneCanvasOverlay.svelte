<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Only the selected-block outline. Delete is the toolbar's first tool:
  // floating above the block, it covered the text of the block before it.
  let {
    selected,
    selectedBox,
  }: {
    selected: { id: string; type: string } | null;
    selectedBox: { top: number; left: number; width: number; height: number } | null;
  } = $props();
</script>

{#if selected && selectedBox}
  <div
    class="m-block-selected"
    style="top:{selectedBox.top}px; left:{selectedBox.left}px; width:{selectedBox.width}px; height:{selectedBox.height}px"
  ></div>
{/if}

<style>
  /* The inset hairline keeps the ring visible over a dark block surface. */
  .m-block-selected {
    position: absolute;
    pointer-events: none;
    border: 1.5px solid var(--ds-color-accent);
    box-shadow: inset 0 0 0 1px var(--ds-color-indicator-companion);
    border-radius: var(--ds-radius-md);
    z-index: 10;
  }
</style>
