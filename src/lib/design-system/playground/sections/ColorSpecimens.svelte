<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import ColorField from '../../ColorField.svelte';
  import ColorPickerField from '../../ColorPickerField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // The group's name is the caller's, so each specimen wraps ColorField in a
  // labelled group. These swatches stand in for the content palette.
  const SWATCHES = ['#0f172a', '#1e293b', '#475569', '#2563eb', '#0ea5e9', '#059669', '#ca8a04', '#dc2626', '#7c3aed', '#f8fafc']; // ui-check-allow: color — specimen swatches

  let unset = $state<string | null>(null);
  let palette = $state<string | null>('#2563eb');
  let custom = $state<string | null>('#ff6b1a');
  let mixed = $state<string | null>('#2563eb');

  let pickUnset = $state<string | null>(null);
  let pickSet = $state<string | null>('#059669');
  let pickOpen = $state<string | null>(null);

  // Colours that follow the scheme (docs/architecture/theming.md, "Colour references"); a
  // few stand in for the content feature's list.
  const themeColors = [
    { value: 'token:text', label: 'Text', css: 'var(--content-theme-text)' },
    { value: 'token:muted', label: 'Muted text', css: 'var(--content-theme-muted)' },
    { value: 'token:subtle', label: 'Subtle background', css: 'var(--content-theme-subtle)' },
    { value: 'token:accent', label: 'Accent', css: 'var(--content-theme-accent)' },
    { value: 'token:accent-soft', label: 'Soft accent', css: 'var(--content-theme-accent-soft)' },
    { value: 'token:inverse', label: 'Inverse', css: 'var(--content-theme-inverse)' },
    { value: 'token:warning', label: 'Warning', css: 'var(--content-theme-warning)' },
  ];
  let themed = $state<string | null>('token:accent');
  let pickThemed = $state<string | null>('token:inverse');
  let themeOnly = $state<string | null>('token:subtle');
</script>

<SpecimenGrid title="ColorField (the inline swatch group)">
  <Specimen label="value=null (∅ active)" state="field-none">
    <div role="group" aria-label="Background">
      <ColorField swatches={SWATCHES} value={unset} onValueChange={(c) => (unset = c)} noneTitle="No color" customTitle="Custom color" />
    </div>
  </Specimen>
  <Specimen label="palette value (swatch active)" state="field-palette">
    <div role="group" aria-label="Background">
      <ColorField swatches={SWATCHES} value={palette} onValueChange={(c) => (palette = c)} noneTitle="No color" customTitle="Custom color" />
    </div>
  </Specimen>
  <Specimen label="custom value (no swatch active, picker holds it)" state="field-custom">
    <div role="group" aria-label="Background">
      <ColorField swatches={SWATCHES} value={custom} onValueChange={(c) => (custom = c)} noneTitle="No color" customTitle="Custom color" />
    </div>
    <span class="val">value: {custom ?? 'null'}</span>
  </Specimen>
  <Specimen label="mixed (selection spans colors, nothing active)" state="field-mixed">
    <div role="group" aria-label="Text color">
      <ColorField swatches={SWATCHES} value={mixed} onValueChange={(c) => (mixed = c)} mixed noneTitle="No color" customTitle="Custom color" />
    </div>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Theme colours (colours that follow the scheme, above the custom palette)">
  <Specimen label="ColorField with themeColors (theme value active)" state="field-theme">
    <div role="group" aria-label="Background">
      <ColorField swatches={SWATCHES} value={themed} onValueChange={(c) => (themed = c)} {themeColors} themeLabel="Theme" customLabel="Custom" noneTitle="No color" customTitle="Custom color" />
    </div>
    <span class="val">value: {themed ?? 'null'}</span>
  </Specimen>
  <Specimen label="ColorPickerField showing a theme colour by name" state="picker-theme" overlay>
    <ColorPickerField swatches={SWATCHES}
      value={pickThemed}
      onValueChange={(c) => (pickThemed = c)}
      {themeColors}
      themeLabel="Theme"
      customLabel="Custom"
      noneLabel="Auto"
      noneTitle="No color"
      customTitle="Custom color"
      ariaLabel="Background"
    />
  </Specimen>
  <Specimen label="theme colours only (custom=false: no palette, no free picker)" state="field-theme-only">
    <div role="group" aria-label="Page background">
      <ColorField swatches={[]} value={themeOnly} onValueChange={(c) => (themeOnly = c)} {themeColors} themeLabel="Theme" custom={false} noneTitle="Auto" customTitle="Custom color" />
    </div>
    <span class="val">value: {themeOnly ?? 'null'}</span>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="ColorPickerField (the compact trigger)" narrow>
  <Specimen label="unset, resolved previews muted" state="picker-unset">
    <ColorPickerField swatches={SWATCHES}
      value={pickUnset}
      resolved="#1e293b"
      onValueChange={(c) => (pickUnset = c)}
      noneLabel="Auto"
      noneTitle="No color"
      customTitle="Custom color"
      ariaLabel="Background"
    />
  </Specimen>
  <Specimen label="set" state="picker-set">
    <ColorPickerField swatches={SWATCHES}
      value={pickSet}
      onValueChange={(c) => (pickSet = c)}
      noneLabel="Auto"
      noneTitle="No color"
      customTitle="Custom color"
      ariaLabel="Border"
    />
  </Specimen>
  <Specimen label="trigger opens the palette (stays open after a pick)" state="picker-open" overlay>
    <ColorPickerField swatches={SWATCHES}
      value={pickOpen}
      resolved="#475569"
      onValueChange={(c) => (pickOpen = c)}
      noneLabel="Auto"
      noneTitle="No color"
      customTitle="Custom color"
      ariaLabel="Text color"
    />
  </Specimen>
</SpecimenGrid>

<style>
  .val { font-size: var(--ds-text-sm); color: var(--ds-color-muted); font-family: var(--ds-font-mono); }
</style>
