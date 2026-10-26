<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import EmptyState from '../../EmptyState.svelte';
  import Button from '../../Button.svelte';
  import Input from '../../Input.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let query = $state('zzz');
</script>

<SpecimenGrid title="Layouts and sizes">
  <Specimen label="inline, size=md (a list page's else branch)" state="inline-md" wide>
    <EmptyState>No properties yet. Use Add property to create the first one.</EmptyState>
  </Specimen>
  <Specimen label="inline, size=sm (a settings row, a panel)" state="inline-sm">
    <EmptyState size="sm">No home page set.</EmptyState>
  </Specimen>
  <Specimen label="with an action (the next step beside the message)" state="action">
    <EmptyState size="sm">
      No custom logo set.
      {#snippet actions()}
        <Button size="sm" variant="primary">Upload logo</Button>
      {/snippet}
    </EmptyState>
  </Specimen>
  <Specimen label="inline markup (a link) in the message" state="link">
    <EmptyState size="sm">No logo yet — <a href="/dev/design-system?section=empty-state">upload one in Branding</a> first.</EmptyState>
  </Specimen>
  <Specimen label="layout=centered (a results area, a graph)" state="centered" wide>
    <div class="results">
      <EmptyState layout="centered">Type to search pages and documents.</EmptyState>
    </div>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Live (appears as the user types)">
  <Specimen label="live: role=status, announced politely" state="live">
    <div class="picker">
      <Input bind:value={query} size="sm" aria-label="Search pages" />
      <ul class="picker-list">
        <li><EmptyState size="sm" live>No pages match “{query}”.</EmptyState></li>
      </ul>
    </div>
  </Specimen>
</SpecimenGrid>

<style>
  .results { border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); }
  .picker { display: flex; flex-direction: column; gap: var(--ds-space-sm); width: 100%; }
  .picker-list { list-style: none; margin: 0; padding: 0.5rem 0.6rem; border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-sm); }
</style>
