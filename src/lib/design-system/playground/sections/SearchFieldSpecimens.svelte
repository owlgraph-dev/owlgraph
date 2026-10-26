<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import SearchField from '../../SearchField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let term = $state('knowledge graph');
</script>

<SpecimenGrid title="States">
  <Specimen label="with a term" state="md">
    <form role="search" onsubmit={(e) => e.preventDefault()}>
      <SearchField bind:value={term} ariaLabel="Search term" submitLabel="Search" />
    </form>
  </Specimen>
  <Specimen label="placeholder (empty)" state="empty">
    <form role="search" onsubmit={(e) => e.preventDefault()}>
      <SearchField value="" placeholder="Search…" ariaLabel="Search term" submitLabel="Search" />
    </form>
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <SearchField value="graph" disabled ariaLabel="Search term" submitLabel="Search" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Grammar">
  <Specimen label="a page's search field: the whole row, the submit inside" state="row" wide>
    <form role="search" onsubmit={(e) => e.preventDefault()}>
      <SearchField value="" placeholder="Search…" name="q" ariaLabel="Search term" submitLabel="Search" />
    </form>
  </Specimen>
</SpecimenGrid>
