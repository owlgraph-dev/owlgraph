<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The page margin (docs/architecture/blocks/layout.md, "Page settings"). Each viewport stands
  // alone: Auto is the site's margin at this tier (capability defaults),
  // never the page's larger one, so a phone never inherits a desktop inset.
  import { editTier } from '$lib/features/content';
  import { FieldRow, NumberField, Popover, SegmentedControl, SegmentedControlItem, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { GUTTER_PRESETS, STEP_TOKENS } from '$lib/features/content';
  import { convertLength, formatLength, LENGTH_UNITS, PAGE_GUTTER_BOUNDS, pageGutter, parseLength, type LengthUnit, type PageLayout } from '$lib/features/content';

  let {
    value,
    site,
    onChange,
    onOverlayOpenChange,
  }: {
    value: PageLayout | undefined;
    /** The site's gutter per tier, px — what Auto renders there. */
    site: Record<'desktop' | 'tablet' | 'phone', number>;
    /** The new gutter at the edited viewport, or null for Auto. */
    onChange: (gutter: string | null) => void;
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const LABELS = {
    none: m.capability_spacing_preset_none,
    sm: m.capability_spacing_preset_sm,
    md: m.capability_spacing_preset_md,
    lg: m.capability_spacing_preset_lg,
  } as const;
  const presets = STEP_TOKENS.map((step) => ({ value: formatLength(GUTTER_PRESETS[step], 'px'), label: LABELS[step](), title: `${GUTTER_PRESETS[step]} px` }));

  const bp = $derived($editTier);
  const own = $derived(pageGutter(value, bp));
  const length = $derived(parseLength(own));
  const isPreset = $derived(own != null && presets.some((p) => p.value === own));
  const label = m.capability_spacing_gutter_label();
  const hint = $derived(own == null ? m.capability_common_default_inline({ value: `${site[bp]} px` }) : undefined);
  const unit = $derived<LengthUnit>(length?.unit ?? 'px');

  let customOpen = $state(false);
</script>

<FieldRow layout="stack" {label} {hint} info={m.capability_spacing_gutter_info()}>
  {#snippet trailing()}
    <Popover
      bind:open={customOpen}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
      side="bottom"
      align="end"
      triggerProps={{ 'aria-label': m.capability_spacing_gutter_custom(), title: m.capability_spacing_gutter_custom() }}
    >
      {#snippet trigger()}
        <TriggerFace variant="toolbar" size="sm" active={own != null && !isPreset}>
          <Icon name="sliders" size={14} />
        </TriggerFace>
      {/snippet}
      <div class="gf-custom">
        <NumberField
          size="sm"
          value={length?.value ?? null}
          min={PAGE_GUTTER_BOUNDS[unit].min}
          max={PAGE_GUTTER_BOUNDS[unit].max}
          step={unit === 'rem' ? 0.25 : 1}
          placeholder={String(unit === 'px' ? site[bp] : site[bp] / 16)}
          ariaLabel={m.editor_page_width_value({ label })}
          onValueChange={(v) => onChange(v == null ? null : formatLength(v, unit))}
        />
        <SegmentedControl type="single" size="sm" value={unit} ariaLabel={m.editor_page_width_unit({ label })}>
          {#each LENGTH_UNITS as u (u)}
            <SegmentedControlItem
              value={u}
              onclick={() => onChange(convertLength(length ?? { value: site[bp], unit: 'px' }, u, PAGE_GUTTER_BOUNDS))}
              title={u}
            >{u}</SegmentedControlItem>
          {/each}
        </SegmentedControl>
      </div>
    </Popover>
  {/snippet}
  <SegmentedControl type="single" size="sm" stretch value={isPreset ? (own ?? '') : own == null ? '' : 'custom'} ariaLabel={label}>
    <SegmentedControlItem value="" onclick={() => onChange(null)} title={m.capability_common_default_inline({ value: `${site[bp]} px` })}>{m.capability_common_auto()}</SegmentedControlItem>
    {#each presets as p (p.value)}
      <SegmentedControlItem value={p.value} onclick={() => onChange(p.value)} title={p.title}>{p.label}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>

<style>
  .gf-custom { display: flex; align-items: center; gap: var(--ds-space-sm); padding: var(--ds-space-sm); }
</style>
