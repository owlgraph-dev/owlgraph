<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import SortableList from '../../SortableList.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  type Chapter = { id: string; title: string };
  let chapters = $state<Chapter[]>([
    { id: 'c1', title: 'Introduction' },
    { id: 'c2', title: 'Methods' },
    { id: 'c3', title: 'Results' },
    { id: 'c4', title: 'Discussion' },
  ]);

  function move(from: number, to: number) {
    const next = [...chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    chapters = next;
  }
</script>

<SpecimenGrid title="Rearranged by its user">
  <Specimen label="drag a handle, or focus it and press ↑ / ↓ — order: {chapters.map((c) => c.title).join(', ')}" state="default" wide>
    <SortableList
      items={chapters}
      key={(c) => c.id}
      onMove={move}
      handleLabel={(c) => `Move ${c.title}`}
      instructions="Press the up or down arrow to move it."
      announce={(c, position, count) => `${c.title}, position ${position} of ${count}`}
      ariaLabel="Chapters"
    >
      {#snippet item(chapter, { handle })}
        <div class="row">{@render handle()}<span>{chapter.title}</span></div>
      {/snippet}
    </SortableList>
  </Specimen>
  <Specimen label="disabled (a move in flight)" state="disabled" wide>
    <SortableList
      items={chapters.slice(0, 2)}
      key={(c) => c.id}
      onMove={() => {}}
      handleLabel={(c) => `Move ${c.title}`}
      instructions="Press the up or down arrow to move it."
      announce={(c, position, count) => `${c.title}, position ${position} of ${count}`}
      ariaLabel="Chapters, waiting"
      disabled
    >
      {#snippet item(chapter, { handle })}
        <div class="row">{@render handle()}<span>{chapter.title}</span></div>
      {/snippet}
    </SortableList>
  </Specimen>
</SpecimenGrid>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    padding: calc(var(--ds-space-sm) / 2) var(--ds-space-sm);
    border-bottom: 1px solid var(--ds-color-border);
    font-family: var(--ds-font-sans);
    color: var(--ds-color-fg);
  }
</style>
