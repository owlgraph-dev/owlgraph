<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Slider from '../../Slider.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let basic = $state(40);
  let strength = $state(2.5);
  let live = $state(30);
  let committed = $state(30);
</script>

<SpecimenGrid title="States" narrow>
  <Specimen label="default (min=0 max=100 step=1)" state="default">
    <div class="stack">
      <Slider bind:value={basic} ariaLabel="Opacity" />
      <span class="val">value: {basic}</span>
    </div>
  </Specimen>
  <Specimen label="min=0 max=5 step=0.5" state="custom-range">
    <div class="stack">
      <Slider bind:value={strength} min={0} max={5} step={0.5} ariaLabel="Link strength" />
      <span class="val">value: {strength}</span>
    </div>
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <div class="stack">
      <Slider value={65} disabled ariaLabel="Locked" />
    </div>
  </Specimen>
  <Specimen label="onValueChange (per step) vs onValueCommit (on release)" state="change-vs-commit">
    <div class="stack">
      <Slider bind:value={live} onValueCommit={(v) => (committed = v)} ariaLabel="Charge" />
      <span class="val">onValueChange: {live}</span>
      <span class="val">onValueCommit: {committed}</span>
    </div>
  </Specimen>
</SpecimenGrid>

<style>
  .stack { display: flex; flex-direction: column; gap: var(--ds-space-sm); width: 100%; }
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
