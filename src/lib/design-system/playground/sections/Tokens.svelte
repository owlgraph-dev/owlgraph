<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Rendered from the tokens themselves, so it can never disagree with them.
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const colors = ['bg', 'raised', 'raised-modal', 'raised-floating', 'fg', 'muted', 'border', 'border-hover', 'border-strong', 'border-elevated', 'fill-hover', 'accent', 'accent-soft', 'on-accent', 'danger', 'danger-soft', 'info', 'info-soft', 'warning', 'warning-soft', 'success', 'success-soft', 'property', 'property-soft', 'well', 'scrim'];
  const heights = ['control-h-sm', 'control-h-md', 'control-h-lg', 'toolbar-h-sm', 'toolbar-h-md'];
  const scale = ['none', 'sm', 'md', 'lg'];
  const weights = ['normal', 'medium', 'semibold', 'bold'];
  const text = ['xs', 'sm', 'md', 'lg'];
</script>

<SpecimenGrid title="Colors">
  {#each colors as c (c)}
    <Specimen label="--ds-color-{c}" state="color-{c}">
      <span class="swatch" style="background: var(--ds-color-{c})"></span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Focus ring (live — Tab into the button)">
  <Specimen label="--ds-focus-ring, --ds-focus-ring-offset" state="focus-ring">
    <button type="button" class="ring-probe">Tab here</button>
    <span class="hint">One global :focus-visible rule; the ring paints inside the box.</span>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Space">
  {#each scale as s (s)}
    <Specimen label="--ds-space-{s}" state="space-{s}">
      <span class="bar" style="width: var(--ds-space-{s})"></span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Control heights (every bordered control of a size is exactly this tall)">
  {#each heights as h (h)}
    <Specimen label="--ds-{h}" state={h}>
      <span class="height" style="height: var(--ds-{h})"></span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Radius">
  {#each [...scale, 'pill'] as s (s)}
    <Specimen label="--ds-radius-{s}" state="radius-{s}">
      <span class="box" style="border-radius: var(--ds-radius-{s})"></span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Disabled and layers">
  <Specimen label="--ds-opacity-disabled" state="opacity-disabled">
    <span class="swatch" style="background: var(--ds-color-accent); opacity: var(--ds-opacity-disabled)"></span>
  </Specimen>
  <Specimen label="--ds-z-nav < --ds-z-scrim < --ds-z-modal < --ds-z-floating" state="z-layers">
    <span class="hint">150 · 200 · 201 · 300 — a floating layer covers a modal.</span>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Shadow">
  {#each scale as s (s)}
    <Specimen label="--ds-shadow-{s}" state="shadow-{s}">
      <span class="box box-plain" style="box-shadow: var(--ds-shadow-{s})"></span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Weight">
  {#each weights as w (w)}
    <Specimen label="--ds-weight-{w}" state="weight-{w}">
      <span style="font-weight: var(--ds-weight-{w})">The quick brown fox</span>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Text">
  {#each text as t (t)}
    <Specimen label="--ds-text-{t}" state="text-{t}">
      <span style="font-size: var(--ds-text-{t})">The quick brown fox</span>
    </Specimen>
  {/each}
  <Specimen label="--ds-font-mono" state="font-mono">
    <span style="font-family: var(--ds-font-mono)">const x = 42;</span>
  </Specimen>
</SpecimenGrid>

<style>
  .height { display: inline-block; width: 3rem; background: var(--ds-color-accent-soft); border: 1px solid var(--ds-color-accent); }
  .swatch {
    display: inline-block;
    width: 3rem;
    height: 2rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
  }
  .bar { display: inline-block; height: 1rem; background: var(--ds-color-accent); min-width: 1px; }
  .box {
    display: inline-block;
    width: 3rem;
    height: 3rem;
    background: var(--ds-color-accent-soft);
    border: 1px solid var(--ds-color-accent);
  }
  .box-plain { background: var(--ds-color-bg); border-color: var(--ds-color-border); border-radius: var(--ds-radius-md); }
  .ring-probe {
    font: inherit;
    padding: var(--ds-space-sm) var(--ds-space-md);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-bg);
    cursor: pointer;
  }
  .hint { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
