<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Combobox from '../../Combobox.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const fonts = ['Inter', 'Georgia', 'Merriweather', 'Source Sans', 'JetBrains Mono'];
  const sizes = [12, 14, 16, 18, 20, 24, 32];

  let font = $state<string | null>('Inter');
  let size = $state<string | null>('16');
  let tag = $state<string | null>(null);
  let onEnter = $state<string | null>('Inter');
</script>

<SpecimenGrid title="Types" narrow>
  <Specimen label="type=text, suggestions (free text allowed)" state="text" overlay>
    <Combobox value={font} options={fonts} onValueChange={(v) => (font = v)} ariaLabel="Font family" />
    <span class="val">value: {font ?? 'null'}</span>
  </Specimen>
  <Specimen label="type=number, min=8 max=96" state="number" overlay>
    <Combobox type="number" value={size} options={sizes} onValueChange={(v) => (size = v)} min={8} max={96} ariaLabel="Font size" />
    <span class="val">value: {size ?? 'null'}</span>
  </Specimen>
  <Specimen label="size=sm (the narrow-panel row, Input/Select sm height)" state="sm" overlay>
    <Combobox size="sm" value={font} options={fonts} onValueChange={(v) => (font = v)} ariaLabel="Font family" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States" narrow>
  <Specimen label="placeholder (empty, no suggestions)" state="placeholder">
    <Combobox value={tag} options={[]} onValueChange={(v) => (tag = v)} placeholder="New tag" ariaLabel="Tag" />
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <Combobox value="Georgia" options={fonts} onValueChange={() => {}} disabled ariaLabel="Font family" />
  </Specimen>
  <Specimen label="commitOnBlur=false (only Enter or a pick commits)" state="commit-on-enter">
    <Combobox value={onEnter} options={fonts} onValueChange={(v) => (onEnter = v)} commitOnBlur={false} ariaLabel="Font family" />
    <span class="val">value: {onEnter ?? 'null'}</span>
  </Specimen>
</SpecimenGrid>

<style>
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
