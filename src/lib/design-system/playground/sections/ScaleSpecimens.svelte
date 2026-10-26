<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import ScaleField from '../../ScaleField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // Stands in for the content type scale's steps (docs/architecture/typography.md).
  const steps = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'].map((label, i, all) => ({
    value: `scale:${label}`,
    label,
    hint: ['0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem', '1.5rem', '1.875rem', '2.25rem', '3rem', '3.75rem'][i],
    preview: `${0.8125 + (0.8125 * i) / (all.length - 1)}rem`,
  }));
  const customOptions = [12, 14, 16, 18, 20, 24];

  let unset = $state<string | number | null>(null);
  let step = $state<string | number | null>('scale:2xl');
  let custom = $state<string | number | null>(22);
  let mixed = $state<string | number | null>('scale:m');
</script>

<SpecimenGrid title="ScaleField (steps first, a custom number second)">
  <Specimen label="value=null (nothing chosen)" state="unset">
    <ScaleField value={unset} onValueChange={(v) => (unset = v)} {steps} {customOptions} stepsLabel="Scale" customLabel="Custom" customTitle="Custom font size (px)" customPlaceholder="px" min={8} max={96} />
  </Specimen>
  <Specimen label="a step chosen (checked, custom box empty)" state="step">
    <ScaleField value={step} onValueChange={(v) => (step = v)} {steps} {customOptions} stepsLabel="Scale" customLabel="Custom" customTitle="Custom font size (px)" customPlaceholder="px" min={8} max={96} />
    <span class="val">value: {step ?? 'null'}</span>
  </Specimen>
  <Specimen label="a custom number (no step checked, box holds it)" state="custom">
    <ScaleField value={custom} onValueChange={(v) => (custom = v)} {steps} {customOptions} stepsLabel="Scale" customLabel="Custom" customTitle="Custom font size (px)" customPlaceholder="px" min={8} max={96} />
    <span class="val">value: {custom ?? 'null'}</span>
  </Specimen>
  <Specimen label="mixed (selection spans sizes, nothing checked)" state="mixed">
    <ScaleField value={mixed} onValueChange={(v) => (mixed = v)} mixed {steps} {customOptions} stepsLabel="Scale" customLabel="Custom" customTitle="Custom font size (px)" customPlaceholder="Mixed" min={8} max={96} />
  </Specimen>
</SpecimenGrid>

<style>
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
