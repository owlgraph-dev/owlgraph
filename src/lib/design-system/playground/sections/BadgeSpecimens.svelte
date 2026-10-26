<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Badge from '../../Badge.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
</script>

<SpecimenGrid title="Tones">
  {#each tones as tone (tone)}
    <Specimen label="tone={tone}" state="tone-{tone}">
      <Badge {tone}>string</Badge>
      <Badge {tone}>HTML</Badge>
      <Badge {tone}>core</Badge>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="title (full text on hover)" state="title">
    <Badge title="Declared datatype: date-time">date-time</Badge>
    <Badge tone="info" title="Value comes from the document's HTML">HTML</Badge>
  </Specimen>
  <Specimen label="long label (never wraps)" state="long">
    <Badge tone="accent">inherited from namespace</Badge>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Grammar">
  <Specimen label="inline next to a name" state="inline-name">
    <span class="name">published_at <Badge>date-time</Badge></span>
  </Specimen>
  <Specimen label="in a list of names" state="inline-list">
    <ul class="list">
      <li><span class="name">title</span> <Badge>string</Badge></li>
      <li><span class="name">author</span> <Badge tone="accent">reference</Badge></li>
      <li><span class="name">body</span> <Badge tone="info">HTML</Badge></li>
    </ul>
  </Specimen>
</SpecimenGrid>

<style>
  .name { display: inline-flex; align-items: center; gap: var(--ds-space-sm); font-family: var(--ds-font-sans); color: var(--ds-color-fg); }
  .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .list li { display: flex; align-items: center; gap: var(--ds-space-sm); }
</style>
