<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Pagination from '../../Pagination.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // Each page links back to this section; the specimen fixes `page`.
  const href = (n: number) => `/dev/design-system?section=pagination&p=${n}`;
  const labels = { ariaLabel: 'Pages of results', previousLabel: 'Previous', nextLabel: 'Next', pageLabel: (n: number) => `Page ${n}` };
</script>

<SpecimenGrid title="Positions">
  <Specimen label="first page (no previous)" state="first" wide>
    <Pagination page={1} pageCount={18} {href} {...labels} />
  </Specimen>
  <Specimen label="a middle page (gaps on both sides)" state="middle" wide>
    <Pagination page={9} pageCount={18} {href} {...labels} />
  </Specimen>
  <Specimen label="last page (no next)" state="last" wide>
    <Pagination page={18} pageCount={18} {href} {...labels} />
  </Specimen>
  <Specimen label="few pages (no gaps)" state="few" wide>
    <Pagination page={2} pageCount={3} {href} {...labels} />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Narrow container">
  <Specimen label="the short row: first, current, last" state="narrow">
    <div class="narrow"><Pagination page={9} pageCount={18} {href} {...labels} /></div>
  </Specimen>
</SpecimenGrid>

<style>
  .narrow { width: 20rem; max-width: 100%; }
</style>
