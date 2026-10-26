<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The desktop's column count is the grid's structure, changed with the
  // block tools; a tablet or phone has Auto or a template of its own.
  import { FieldRow, NumberField, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import { editTier } from '$lib/features/content';
  import type { Tier } from '$lib/features/content';
  import {
    desktopColumns,
    ownGridColumns,
    ownGridGap,
    resolvedGridColumns,
    resolvedGridGap,
    MAX_GRID_RATIO,
    type GapStep,
    type GridColumnAttrs,
    type GridTier,
  } from '$lib/features/content';
  import { ColumnTemplateField } from '$lib/features/pages/components';
  import * as m from '$lib/paraglide/messages';

  let { attrs, onWidths, onTierColumns, onGap }: {
    attrs: GridColumnAttrs;
    onWidths: (next: number[]) => void;
    onTierColumns: (tier: GridTier, ratios: number[] | null) => void;
    onGap: (bp: Tier, step: GapStep | null) => void;
  } = $props();

  const bp = $derived($editTier);
  const widths = $derived(desktopColumns(attrs));
  const tablet = $derived(resolvedGridColumns(attrs, 'tablet'));
  const own = $derived(bp === 'desktop' ? null : ownGridColumns(attrs, bp));
  // A phone never has more columns than the tablet: with one there, it can only stack.
  const cap = $derived(bp === 'phone' ? tablet.length : widths.length);
  const template = $derived({
    desktop: widths.map((n) => Math.min(MAX_GRID_RATIO, n)),
    tablet,
    phone: resolvedGridColumns(attrs, 'phone'),
  });
  const autoHint = $derived(bp === 'tablet' ? m.editor_grid_columns_auto_tablet({ count: widths.length }) : m.editor_grid_columns_auto_phone());

  // Starts from a template the tier doesn't already have, so the choice is
  // stored at once.
  function custom(tier: GridTier) {
    if (tier === 'tablet') onTierColumns('tablet', widths.length >= 3 ? [1, 1] : [1]);
    else onTierColumns('phone', [...tablet]);
  }

  const GAP_LABEL: Record<GapStep, () => string> = {
    none: m.capability_spacing_preset_none,
    sm: m.capability_spacing_preset_sm,
    md: m.capability_spacing_preset_md,
    lg: m.capability_spacing_preset_lg,
  };
  const STEPS: GapStep[] = ['none', 'sm', 'md', 'lg'];

  const gap = $derived(bp === 'desktop' ? ((attrs.gap as GapStep | undefined) ?? null) : ownGridGap(attrs, bp));
  const gapHint = $derived(gap == null ? (bp === 'desktop' ? m.capability_common_default_inline({ value: GAP_LABEL[resolvedGridGap(attrs, 'desktop')]() }) : m.capability_common_inherited_inline({ value: GAP_LABEL[resolvedGridGap(attrs, bp)]() })) : undefined);
</script>

{#if bp === 'desktop'}
  {#if widths.length > 1}
    <FieldRow layout="stack" label={m.editor_block_settings_column_widths_label()}>
      <div class="cols">
        {#each widths as w, i (i)}
          <NumberField
            size="sm"
            value={w}
            min={1}
            ariaLabel={m.editor_block_settings_column_title({ n: i + 1 })}
            onValueChange={(v) => {
              const next = [...widths];
              next[i] = Math.max(1, v ?? 1);
              onWidths(next);
            }}
          />
        {/each}
      </div>
    </FieldRow>
  {/if}
{:else if widths.length > 1}
  {@const tier = bp}
  <!-- Stacked: "Columns · Auto · as on the desktop, 4 columns" beside the control would ellipsize the hint. -->
  <FieldRow layout="stack" label={m.editor_page_columns_label()} hint={own ? undefined : autoHint}>
    <SegmentedControl type="single" size="sm" stretch value={own ? 'own' : 'auto'} ariaLabel={m.editor_page_columns_label()}>
      <SegmentedControlItem value="auto" onclick={() => onTierColumns(tier, null)}>{m.capability_common_auto()}</SegmentedControlItem>
      <SegmentedControlItem value="own" disabled={cap < 2 && tier === 'phone'} onclick={() => { if (!own) custom(tier); }}>{m.editor_grid_columns_custom()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  {#if own}
    <ColumnTemplateField
      {template}
      {tier}
      maxColumns={widths.length}
      label={m.editor_grid_columns_count()}
      info={m.editor_grid_columns_info()}
      onChange={(next) => onTierColumns(tier, next[tier])}
    />
  {/if}
{/if}

<FieldRow layout="stack" label={m.editor_page_columns_gap()} hint={gapHint}>
  <SegmentedControl type="single" size="sm" stretch value={gap ?? ''} ariaLabel={m.editor_page_columns_gap()}>
    <SegmentedControlItem value="" onclick={() => onGap(bp, null)}>{bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit()}</SegmentedControlItem>
    {#each STEPS as step (step)}
      <SegmentedControlItem value={step} onclick={() => onGap(bp, step)}>{GAP_LABEL[step]()}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>

<style>
  .cols { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); align-items: center; }
</style>
