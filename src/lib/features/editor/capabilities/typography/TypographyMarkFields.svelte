<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Marks are per-run overrides, not a responsive cascade: no viewport tier,
  // no Auto/Inherit. A field the selection holds differing values for is
  // "mixed": no option active, plus a hint.
  import { SegmentedControl, SegmentedControlItem, ColorField, Combobox, ScaleField, Select, FieldWarning } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { themeColorOptions } from '$lib/features/content';
  import { FONT_IDS, FONT_LABELS } from '$lib/features/content';
  import { getCustomFontLabels } from '$lib/features/content';
  import { CUSTOM_SIZE_STEPS, SIZE_MAX, SIZE_MIN, typeScaleOptions, type TypeSize } from '$lib/features/content';
  import { COLOR_SWATCHES } from '$lib/features/content';
  import {
    LINE_HEIGHT_MIN,
    LINE_HEIGHT_MAX,
    LINE_HEIGHT_STEPS,
    LETTER_SPACING_MIN,
    LETTER_SPACING_MAX,
    LETTER_SPACING_STEPS,
    type WeightToken,
  } from '$lib/features/content';

  type Field = 'family' | 'size' | 'color' | 'weight' | 'lineHeight' | 'letterSpacing';

  let {
    value,
    mixed,
    onChange,
    fields = ['family', 'size', 'color', 'weight', 'lineHeight', 'letterSpacing'],
    colorWarning = null,
  }: {
    value: { family: string | null; size: TypeSize | null; color: string | null; weight: WeightToken | null; lineHeight: number | null; letterSpacing: number | null };
    mixed: { family: boolean; size: boolean; color: boolean; weight: boolean; lineHeight: boolean; letterSpacing: boolean };
    onChange: (field: Field, value: string | number | null) => void;
    fields?: Field[];
    /** Whether the colour reads where the selection sits (contrastGuidance.ts), computed by the caller. */
    colorWarning?: string | null;
  } = $props();
  const uid = $props.id();
  const colorWarningId = `${uid}-color-warning`;

  const WEIGHT_OPTS: [WeightToken, () => string][] = [
    ['normal', m.capability_typography_weight_regular],
    ['medium', m.capability_typography_weight_medium],
    ['semibold', m.capability_typography_weight_semibold],
    ['bold', m.capability_typography_weight_bold],
  ];

  // Matches no item, so a mixed field shows none active ('' would match Clear).
  const MIXED = '\u0000mixed';
  const familyGroupValue = $derived(mixed.family ? MIXED : (value.family ?? ''));
  const familyItems = $derived([
    { value: '', label: '∅' },
    ...FONT_IDS.map((id) => ({ value: id, label: FONT_LABELS[id] })),
    ...getCustomFontLabels().map((f) => ({ value: f.id, label: f.label })),
  ]);
  const sizeGroupValue = $derived(!mixed.size && value.size == null ? '' : MIXED);
  const weightGroupValue = $derived(mixed.weight ? MIXED : (value.weight ?? ''));
  const lineHeightGroupValue = $derived(!mixed.lineHeight && value.lineHeight == null ? '' : MIXED);
  const letterSpacingGroupValue = $derived(!mixed.letterSpacing && value.letterSpacing == null ? '' : MIXED);
</script>

{#if fields.length > 1}<p class="tmf-label">{m.capability_typography_mark_label()}</p>{/if}

{#if fields.includes('family')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_font()}</p>
  <Select
    items={familyItems}
    value={familyGroupValue}
    onValueChange={(v) => onChange('family', v || null)}
    ariaLabel={m.capability_typography_font()}
  />
  {#if mixed.family}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
</section>
{/if}

{#if fields.includes('size')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_size()}</p>
  <SegmentedControl type="single" value={sizeGroupValue} ariaLabel={m.capability_typography_size()}>
    <SegmentedControlItem value="" onclick={() => onChange('size', null)} title={m.capability_common_clear()}>∅</SegmentedControlItem>
  </SegmentedControl>
  {#if mixed.size}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
  <div class="tmf-scale">
    <ScaleField
      value={value.size}
      mixed={mixed.size}
      onValueChange={(v) => onChange('size', v)}
      steps={typeScaleOptions()}
      stepsLabel={m.capability_typography_size_scale()}
      customLabel={m.capability_typography_size_custom()}
      customTitle={m.capability_typography_size_title()}
      customPlaceholder={mixed.size ? m.capability_common_mixed() : 'px'}
      customOptions={CUSTOM_SIZE_STEPS}
      min={SIZE_MIN}
      max={SIZE_MAX}
    />
  </div>
</section>
{/if}

{#if fields.includes('color')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_color()}</p>
  <ColorField swatches={COLOR_SWATCHES}
    value={value.color}
    mixed={mixed.color}
    onValueChange={(c) => onChange('color', c)}
    noneTitle={m.capability_common_clear()}
    customTitle={m.capability_common_custom_color()}
    themeColors={themeColorOptions()}
    themeLabel={m.capability_color_theme()}
    customLabel={m.capability_color_custom()}
  />
  {#if mixed.color}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
  {#if colorWarning && !mixed.color}<div class="tmf-warning"><FieldWarning id={colorWarningId} message={colorWarning} /></div>{/if}
</section>
{/if}

{#if fields.includes('weight')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_weight()}</p>
  <SegmentedControl type="single" value={weightGroupValue} ariaLabel={m.capability_typography_weight()}>
    <SegmentedControlItem value="" onclick={() => onChange('weight', null)} title={m.capability_common_clear()}>∅</SegmentedControlItem>
    {#each WEIGHT_OPTS as [key, label] (key)}
      <SegmentedControlItem value={key} onclick={() => onChange('weight', key)} title={label()}>{label()}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
  {#if mixed.weight}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
</section>
{/if}

{#if fields.includes('lineHeight')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_line_height()}</p>
  <div class="tmf-combo">
    <SegmentedControl type="single" value={lineHeightGroupValue} ariaLabel={m.capability_typography_line_height()}>
      <SegmentedControlItem value="" onclick={() => onChange('lineHeight', null)} title={m.capability_common_clear()}>∅</SegmentedControlItem>
    </SegmentedControl>
    <Combobox
      type="number"
      min={LINE_HEIGHT_MIN}
      max={LINE_HEIGHT_MAX}
      options={LINE_HEIGHT_STEPS}
      value={mixed.lineHeight ? '' : (value.lineHeight ?? '')}
      placeholder={mixed.lineHeight ? m.capability_common_mixed() : m.capability_typography_ambient()}
      title={m.capability_typography_line_height_title()}
      onValueChange={(raw) => {
        if (raw == null) { onChange('lineHeight', null); return; }
        const v = Number(raw);
        onChange('lineHeight', Number.isFinite(v) ? v : null);
      }}
    />
  </div>
  {#if mixed.lineHeight}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
</section>
{/if}

{#if fields.includes('letterSpacing')}
<section class="tmf-row">
  <p class="tmf-row-label">{m.capability_typography_letter_spacing()}</p>
  <div class="tmf-combo">
    <SegmentedControl type="single" value={letterSpacingGroupValue} ariaLabel={m.capability_typography_letter_spacing()}>
      <SegmentedControlItem value="" onclick={() => onChange('letterSpacing', null)} title={m.capability_common_clear()}>∅</SegmentedControlItem>
    </SegmentedControl>
    <Combobox
      type="number"
      min={LETTER_SPACING_MIN}
      max={LETTER_SPACING_MAX}
      options={LETTER_SPACING_STEPS}
      value={mixed.letterSpacing ? '' : (value.letterSpacing ?? '')}
      placeholder={mixed.letterSpacing ? m.capability_common_mixed() : 'em'}
      title={m.capability_typography_letter_spacing_title()}
      onValueChange={(raw) => {
        if (raw == null) { onChange('letterSpacing', null); return; }
        const v = Number(raw);
        onChange('letterSpacing', Number.isFinite(v) ? v : null);
      }}
    />
  </div>
  {#if mixed.letterSpacing}<p class="tmf-hint">{m.capability_common_mixed()}</p>{/if}
</section>
{/if}

<style>
  .tmf-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.5rem; }
  .tmf-row { margin-bottom: 0.9rem; }
  .tmf-row:last-child { margin-bottom: 0; }
  .tmf-warning { margin-top: 0.4rem; }
  .tmf-row-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.4rem; }
  .tmf-combo { display: inline-flex; gap: 0.35rem; align-items: center; }
  .tmf-hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); margin: 0.4rem 0 0; }
  .tmf-scale { margin-top: 0.5rem; }
</style>
