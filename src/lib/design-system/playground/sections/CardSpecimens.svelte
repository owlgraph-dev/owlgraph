<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Card from '../../Card.svelte';
  import Badge from '../../Badge.svelte';
  import Chip from '../../Chip.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';
</script>

{#snippet result(title: string, kind: string, excerpt = 'A short excerpt of what the item is about, cut at a word boundary so it never ends mid-word…')}
  <a class="title" href="/dev/design-system?section=card">{title}</a>
  <div class="row"><Badge>{kind}</Badge></div>
  {#if excerpt}<p class="excerpt">{excerpt}</p>{/if}
  <!-- Pinned to the bottom, so a stretched grid row's feet line up. -->
  <div class="foot">
    <span class="meta">Updated Oct 6, 2026 · Wiki</span>
    <div class="row"><Chip label="graph" size="sm" /><Chip label="ontology" size="sm" /></div>
  </div>
{/snippet}

<SpecimenGrid title="Sizes">
  <Specimen label="size=md (default)" state="md">
    <Card>{@render result('Knowledge graphs', 'Concept')}</Card>
  </Specimen>
  <Specimen label="size=sm (a dense list)" state="sm">
    <Card size="sm">{@render result('Knowledge graphs', 'Concept')}</Card>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Grammar">
  <Specimen label="a grid of results (as=li in a list): a row is one height, the foot at the bottom" state="grid" wide>
    <ul class="card-grid">
      <Card as="li">{@render result('Knowledge graphs', 'Concept')}</Card>
      <Card as="li">{@render result('A very long title that has to wrap onto a second line in a narrow column', 'Page')}</Card>
      <Card as="li">{@render result('Annual report 2025', 'PDF', '')}</Card>
    </ul>
  </Specimen>
</SpecimenGrid>

<style>
  /* The card's one target: 44px on touch, like the search page's cards. */
  .title { display: flex; align-items: center; min-height: var(--ds-target-min); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); color: var(--ds-color-link); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
  .meta { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .excerpt { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
  .foot { display: flex; flex-direction: column; gap: var(--ds-space-sm); margin-top: auto; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr)); gap: var(--ds-space-md); margin: 0; padding: 0; list-style: none; }
</style>
