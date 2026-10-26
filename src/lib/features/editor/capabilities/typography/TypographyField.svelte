<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { editTier } from '$lib/features/content';
  import { SegmentedControl, SegmentedControlItem, ColorField, Combobox, ScaleField, Select, FieldWarning } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { themeColorOptions, colorLabel } from '$lib/features/content';
  import { FONT_IDS, FONT_LABELS } from '$lib/features/content';
  import { getCustomFontLabels } from '$lib/features/content';
  import type { ElementDefaults } from '$lib/features/content';
  import { CUSTOM_SIZE_STEPS, SIZE_MAX, SIZE_MIN, sizeLabel, typeScaleOptions } from '$lib/features/content';
  import { COLOR_SWATCHES } from '$lib/features/content';
  import {
    resolvedFamily,
    resolvedSize,
    resolvedColor,
    resolvedWeight,
    resolvedLineHeight,
    resolvedLetterSpacing,
    LINE_HEIGHT_MIN,
    LINE_HEIGHT_MAX,
    LINE_HEIGHT_STEPS,
    LETTER_SPACING_MIN,
    LETTER_SPACING_MAX,
    LETTER_SPACING_STEPS,
    type TypographyData,
    type WeightToken,
  } from '$lib/features/content';

  type Field = 'family' | 'size' | 'color' | 'weight' | 'lineHeight' | 'letterSpacing';

  let {
    value,
    defaults = {},
    onChange,
    fields = ['family', 'size', 'color', 'weight', 'lineHeight', 'letterSpacing'],
    colorWarning = null,
    innerColors = false,
  }: {
    value: TypographyData | undefined;
    /** The target's resolved defaults, for the hints only; without them the hints show body text's. */
    defaults?: ElementDefaults;
    onChange: (field: Field, value: string | number | null) => void;
    fields?: Field[];
    /** Whether the colour reads on the block's background (contrastGuidance.ts), computed by the caller. */
    colorWarning?: string | null;
    /** Text inside the block carries a colour of its own: Default clears it too, so it is not shown as already chosen. */
    innerColors?: boolean;
  } = $props();

  const uid = $props.id();
  const colorWarningId = `${uid}-color-warning`;
  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());

  const ownFamily = $derived(value?.[bp]?.family ?? null);
  const ownSize = $derived(value?.[bp]?.size ?? null);
  const ownColor = $derived(value?.[bp]?.color ?? null);
  const ownWeight = $derived(value?.[bp]?.weight ?? null);
  const ownLineHeight = $derived(value?.[bp]?.lineHeight ?? null);
  const ownLetterSpacing = $derived(value?.[bp]?.letterSpacing ?? null);

  const resolvedFamilyHint = $derived(resolvedFamily(value, bp, defaults));

  // Custom families are read from the registry per render: a small list,
  // simpler than a store around its module-level singleton.
  const familyItems = $derived([
    { value: '', label: autoLabel },
    ...FONT_IDS.map((id) => ({ value: id, label: FONT_LABELS[id] })),
    ...getCustomFontLabels().map((f) => ({ value: f.id, label: f.label })),
  ]);
  function familyLabel(id: string | null): string {
    if (!id) return m.capability_typography_ambient();
    if (id === 'sans' || id === 'serif' || id === 'mono') return FONT_LABELS[id];
    return getCustomFontLabels().find((f) => f.id === id)?.label ?? m.capability_typography_ambient();
  }
  const resolvedSizeHint = $derived(resolvedSize(value, bp, defaults));
  const resolvedColorHint = $derived(resolvedColor(value, bp));
  const resolvedWeightHint = $derived(resolvedWeight(value, bp, defaults));
  const resolvedLineHeightHint = $derived(resolvedLineHeight(value, bp, defaults));
  const resolvedLetterSpacingHint = $derived(resolvedLetterSpacing(value, bp, defaults));

  const WEIGHT_OPTS: [WeightToken, () => string][] = [
    ['normal', m.capability_typography_weight_regular],
    ['medium', m.capability_typography_weight_medium],
    ['semibold', m.capability_typography_weight_semibold],
    ['bold', m.capability_typography_weight_bold],
  ];
</script>

<p class="tf-label">{m.capability_typography_label()}</p>

{#if fields.includes('family')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_font()}</p>
  <Select
    items={familyItems}
    value={ownFamily ?? ''}
    onValueChange={(v) => onChange('family', v || null)}
    ariaLabel={m.capability_typography_font()}
  />
  {#if ownFamily == null}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: familyLabel(resolvedFamilyHint) }) : m.capability_common_inherited_hint({ value: familyLabel(resolvedFamilyHint) })}</p>
  {/if}
</section>
{/if}

{#if fields.includes('size')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_size()}</p>
  <SegmentedControl type="single" value={ownSize == null ? '' : String(ownSize)} ariaLabel={m.capability_typography_size()}>
    <SegmentedControlItem value="" onclick={() => onChange('size', null)} title={bp === 'desktop' ? m.capability_common_default_value({ value: sizeLabel(resolvedSizeHint) }) : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
  </SegmentedControl>
  {#if ownSize == null}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: sizeLabel(resolvedSizeHint) }) : m.capability_common_inherited_hint({ value: sizeLabel(resolvedSizeHint) })}</p>
  {/if}
  <div class="tf-scale">
    <ScaleField
      value={ownSize}
      onValueChange={(v) => onChange('size', v)}
      steps={typeScaleOptions()}
      stepsLabel={m.capability_typography_size_scale()}
      customLabel={m.capability_typography_size_custom()}
      customTitle={m.capability_typography_size_title()}
      customPlaceholder="px"
      customOptions={CUSTOM_SIZE_STEPS}
      min={SIZE_MIN}
      max={SIZE_MAX}
    />
  </div>
</section>
{/if}

{#if fields.includes('color')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_color()}</p>
  <ColorField swatches={COLOR_SWATCHES}
    value={ownColor}
    mixed={innerColors && !ownColor}
    onValueChange={(c) => onChange('color', c)}
    noneTitle={bp === 'desktop' ? m.capability_typography_default_inherit() : m.capability_common_inherit_tier()}
    customTitle={m.capability_common_custom_color()}
    themeColors={themeColorOptions()}
    themeLabel={m.capability_color_theme()}
    customLabel={m.capability_color_custom()}
  />
  {#if innerColors}
    <p class="tf-hint">{m.capability_typography_inner_colors()}</p>
  {:else if !ownColor}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: colorLabel(resolvedColorHint) || m.capability_typography_ambient() }) : m.capability_common_inherited_hint({ value: colorLabel(resolvedColorHint) || m.capability_typography_ambient() })}</p>
  {/if}
  {#if colorWarning}<div class="tf-warning"><FieldWarning id={colorWarningId} message={colorWarning} /></div>{/if}
</section>
{/if}

{#if fields.includes('weight')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_weight()}</p>
  <SegmentedControl type="single" value={ownWeight ?? ''} ariaLabel={m.capability_typography_weight()}>
    <SegmentedControlItem value="" onclick={() => onChange('weight', null)} title={bp === 'desktop' ? m.capability_typography_default_regular() : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
    {#each WEIGHT_OPTS as [key, label] (key)}
      <SegmentedControlItem value={key} onclick={() => onChange('weight', key)} title={label()}>{label()}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
  {#if ownWeight == null}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: resolvedWeightHint ?? m.capability_typography_normal() }) : m.capability_common_inherited_hint({ value: resolvedWeightHint ?? m.capability_typography_normal() })}</p>
  {/if}
</section>
{/if}

{#if fields.includes('lineHeight')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_line_height()}</p>
  <div class="tf-combo">
    <SegmentedControl type="single" value={ownLineHeight == null ? '' : String(ownLineHeight)} ariaLabel={m.capability_typography_line_height()}>
      <SegmentedControlItem value="" onclick={() => onChange('lineHeight', null)} title={bp === 'desktop' ? m.capability_typography_default_inherit() : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
    </SegmentedControl>
    <Combobox
      type="number"
      min={LINE_HEIGHT_MIN}
      max={LINE_HEIGHT_MAX}
      options={LINE_HEIGHT_STEPS}
      value={ownLineHeight ?? ''}
      placeholder={m.capability_typography_ambient()}
      title={m.capability_typography_line_height_title()}
      --combo-width="3.5rem"
      onValueChange={(raw) => {
        if (raw == null) { onChange('lineHeight', null); return; }
        const v = Number(raw);
        onChange('lineHeight', Number.isFinite(v) ? v : null);
      }}
    />
  </div>
  {#if ownLineHeight == null}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: resolvedLineHeightHint != null ? String(resolvedLineHeightHint) : m.capability_typography_ambient() }) : m.capability_common_inherited_hint({ value: resolvedLineHeightHint != null ? String(resolvedLineHeightHint) : m.capability_typography_ambient() })}</p>
  {/if}
</section>
{/if}

{#if fields.includes('letterSpacing')}
<section class="tf-row">
  <p class="tf-row-label">{m.capability_typography_letter_spacing()}</p>
  <div class="tf-combo">
    <SegmentedControl type="single" value={ownLetterSpacing == null ? '' : String(ownLetterSpacing)} ariaLabel={m.capability_typography_letter_spacing()}>
      <SegmentedControlItem value="" onclick={() => onChange('letterSpacing', null)} title={bp === 'desktop' ? m.capability_typography_default_inherit() : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
    </SegmentedControl>
    <Combobox
      type="number"
      min={LETTER_SPACING_MIN}
      max={LETTER_SPACING_MAX}
      options={LETTER_SPACING_STEPS}
      value={ownLetterSpacing ?? ''}
      placeholder="em"
      title={m.capability_typography_letter_spacing_title()}
      --combo-width="3.5rem"
      onValueChange={(raw) => {
        if (raw == null) { onChange('letterSpacing', null); return; }
        const v = Number(raw);
        onChange('letterSpacing', Number.isFinite(v) ? v : null);
      }}
    />
  </div>
  {#if ownLetterSpacing == null}
    <p class="tf-hint">{bp === 'desktop' ? m.capability_common_default_hint({ value: resolvedLetterSpacingHint != null ? `${resolvedLetterSpacingHint}em` : m.capability_typography_ambient() }) : m.capability_common_inherited_hint({ value: resolvedLetterSpacingHint != null ? `${resolvedLetterSpacingHint}em` : m.capability_typography_ambient() })}</p>
  {/if}
</section>
{/if}

<style>
  .tf-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.5rem; }
  .tf-row { margin-bottom: 0.9rem; }
  .tf-row:last-child { margin-bottom: 0; }
  .tf-row-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.4rem; }
  .tf-combo { display: inline-flex; gap: 0.35rem; align-items: center; }
  .tf-hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); margin: 0.4rem 0 0; }
  .tf-scale { margin-top: 0.5rem; }
  .tf-warning { margin-top: 0.4rem; }
</style>
