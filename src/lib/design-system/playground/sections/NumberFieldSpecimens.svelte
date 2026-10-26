<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import NumberField from '../../NumberField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let width = $state<number | null>(300);
  let gap = $state<number | null>(null);
  let opacity = $state<number | null>(50);
  let ratio = $state<number | null>(1.5);
  let count = $state<number | null>(3);
</script>

<SpecimenGrid title="Sizes" narrow>
  <Specimen label="size=sm (block settings rows)" state="sm">
    <NumberField size="sm" value={width} onValueChange={(v) => (width = v)} unit="px" ariaLabel="Width" />
  </Specimen>
  <Specimen label="size=md (default, form rows; matches Select md)" state="md">
    <NumberField size="md" value={width} onValueChange={(v) => (width = v)} unit="px" ariaLabel="Width" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Width" narrow>
  <Specimen label="width=auto (short fixed box)" state="width-auto">
    <NumberField size="sm" value={width} onValueChange={(v) => (width = v)} unit="px" ariaLabel="Width" />
  </Specimen>
  <Specimen label="width=full (fills the cell)" state="width-full">
    <NumberField size="sm" width="full" value={width} onValueChange={(v) => (width = v)} unit="px" ariaLabel="Width" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States" narrow>
  <Specimen label="unit inside the frame" state="unit">
    <NumberField size="sm" value={opacity} onValueChange={(v) => (opacity = v)} unit="%" ariaLabel="Opacity" />
    <NumberField size="sm" value={width} onValueChange={(v) => (width = v)} unit="px" ariaLabel="Width" />
  </Specimen>
  <Specimen label="no unit" state="no-unit">
    <NumberField size="sm" value={count} onValueChange={(v) => (count = v)} ariaLabel="Columns" />
  </Specimen>
  <Specimen label="null = unset, placeholder shows the resolved value" state="placeholder">
    <NumberField size="sm" value={gap} onValueChange={(v) => (gap = v)} unit="px" placeholder="8" ariaLabel="Gap" />
    <span class="val">value: {gap ?? 'null'}</span>
  </Specimen>
  <Specimen label="min=0 max=100 step=5 (clamped, rounded)" state="min-max-step">
    <NumberField size="sm" value={opacity} onValueChange={(v) => (opacity = v)} unit="%" min={0} max={100} step={5} ariaLabel="Opacity" />
    <span class="val">value: {opacity ?? 'null'}</span>
  </Specimen>
  <Specimen label="step=0.1 (fractional, not rounded)" state="fractional-step">
    <NumberField size="sm" value={ratio} onValueChange={(v) => (ratio = v)} min={0} max={10} step={0.1} ariaLabel="Ratio" />
    <span class="val">value: {ratio ?? 'null'}</span>
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <NumberField size="sm" value={12} onValueChange={() => {}} unit="px" disabled ariaLabel="Locked" />
  </Specimen>
  <Specimen label="with visible label (for)" state="labelled">
    <label class="lbl" for="pg-numfield-labelled">Padding</label>
    <NumberField size="sm" id="pg-numfield-labelled" value={width} onValueChange={(v) => (width = v)} unit="px" />
  </Specimen>
</SpecimenGrid>

<style>
  .lbl { font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
