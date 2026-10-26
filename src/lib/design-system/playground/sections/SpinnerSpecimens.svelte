<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Spinner from '../../Spinner.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';
</script>

<SpecimenGrid title="Sizes and colour (takes currentColor)">
  <Specimen label="sizes 14 / 16 / 20 / 28" state="sizes">
    <Spinner size={14} />
    <Spinner />
    <Spinner size={20} />
    <Spinner size={28} />
  </Specimen>
  <Specimen label="muted, beside a status line" state="muted">
    <span class="line"><Spinner size={14} /> Indexing 12 documents</span>
  </Specimen>
  <Specimen label="accent" state="accent">
    <span class="accent"><Spinner size={20} /></span>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Accessibility">
  <Specimen label="decorative (default): the busy thing says so — a Button's aria-busy" state="decorative">
    <Spinner />
  </Specimen>
  <Specimen label="label: the only sign of progress becomes role=status with that name" state="labelled">
    <Spinner label="Loading results" />
  </Specimen>
</SpecimenGrid>

<style>
  .line { display: inline-flex; align-items: center; gap: var(--ds-space-sm); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .accent { color: var(--ds-color-accent); display: inline-flex; }
</style>
