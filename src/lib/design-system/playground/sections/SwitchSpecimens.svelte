<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Switch from '../../Switch.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let off = $state(false);
  let on = $state(true);
  let labelled = $state(true);
  let unlabelled = $state(false);
</script>

<SpecimenGrid title="States">
  <Specimen label="off" state="off">
    <Switch bind:checked={off} ariaLabel="Show border" />
  </Specimen>
  <Specimen label="on" state="on">
    <Switch bind:checked={on} ariaLabel="Show border" />
  </Specimen>
  <Specimen label="disabled, off" state="disabled-off">
    <Switch checked={false} disabled ariaLabel="Show border" />
  </Specimen>
  <Specimen label="disabled, on" state="disabled-on">
    <Switch checked={true} disabled ariaLabel="Show border" />
  </Specimen>
  <Specimen label="size=sm (a dense panel row), off and on with labels" state="sm">
    <Switch size="sm" checked={false} ariaLabel="Sticky" />
    <Switch size="sm" bind:checked={on}>Wrap lines</Switch>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Naming">
  <Specimen label="children label (rendered beside the track)" state="labelled">
    <Switch bind:checked={labelled}>Hide unconnected nodes</Switch>
  </Specimen>
  <Specimen label="ariaLabel only (the visible label is the row's)" state="aria-label">
    <Switch bind:checked={unlabelled} ariaLabel="Sticky" />
  </Specimen>
</SpecimenGrid>
