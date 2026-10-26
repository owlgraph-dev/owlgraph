<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Each group is optional: the caller passes only what its block has, with
  // the block's own write path.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Switch } from '$lib/design-system';
  import GridColumnsField from '../blocks/grid/GridColumnsField.svelte';
  import LayoutField from '../capabilities/layout/LayoutField.svelte';
  import MinHeightField from '../capabilities/height/MinHeightField.svelte';
  import { hasAnyOwnValue, normalizeColumnsByTier, normalizeGapByTier, type GapStep, type GridColumnAttrs, type GridTier, type HeightData, type LayoutArrangement, type LayoutData, type LayoutDefaults, type setLayoutField } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';

  type LayoutFieldName = Parameters<typeof setLayoutField>[2];

  let { width, bleed, flex, height, grid, info }: {
    width?: { value: string; onChange: (value: string) => void };
    bleed?: { value: boolean; onChange: (value: boolean) => void };
    flex?: {
      value: LayoutData | undefined;
      defaults?: LayoutDefaults;
      onChange: (field: LayoutFieldName, value: string | number | null) => void;
      onArrange?: (arrangement: LayoutArrangement | null) => void;
    };
    height?: { value: HeightData | null | undefined; onChange: (next: HeightData) => void };
    grid?: {
      attrs: GridColumnAttrs;
      onWidths: (next: number[]) => void;
      onTierColumns: (tier: GridTier, ratios: number[] | null) => void;
      onGap: (bp: 'desktop' | GridTier, step: GapStep | null) => void;
    };
    /** Help text on the first row. */
    info?: string;
  } = $props();

  const modified = $derived(
    (!!width && width.value !== 'normal') ||
      !!bleed?.value ||
      (!!flex && hasAnyOwnValue(flex.value)) ||
      (!!height && hasAnyOwnValue(height.value ?? null)) ||
      (!!grid &&
        ((Array.isArray(grid.attrs.columnWidths) && grid.attrs.columnWidths.some((w) => w !== (grid.attrs.columnWidths as unknown[])[0])) ||
          grid.attrs.gap != null ||
          Object.keys(normalizeColumnsByTier(grid.attrs)).length > 0 ||
          Object.keys(normalizeGapByTier(grid.attrs)).length > 0))
  );
</script>

<BlockSettingsSection id="layout" title={m.editor_block_settings_section_layout()} {modified}>
  {#if width}
    {@const w = width}
    <FieldRow layout="stack" label={m.section_width_label()} {info}>
      <SegmentedControl type="single" size="sm" stretch value={w.value} ariaLabel={m.section_width_label()}>
        <SegmentedControlItem value="normal" onclick={() => w.onChange('normal')} title={m.section_width_normal_title()}>{m.section_width_normal()}</SegmentedControlItem>
        <SegmentedControlItem value="wide" onclick={() => w.onChange('wide')} title={m.section_width_wide_title()}>{m.section_width_wide()}</SegmentedControlItem>
        <SegmentedControlItem value="full" onclick={() => w.onChange('full')} title={m.section_width_full_title()}>{m.section_width_full()}</SegmentedControlItem>
      </SegmentedControl>
    </FieldRow>
  {/if}
  {#if bleed}
    {@const b = bleed}
    <FieldRow label={m.editor_block_settings_bleed_top()} info={m.editor_block_settings_bleed_top_hint()}>
      <Switch checked={b.value} onCheckedChange={(v) => b.onChange(v)} ariaLabel={m.editor_block_settings_bleed_top()} />
    </FieldRow>
  {/if}
  {#if flex}
    {@const f = flex}
    <LayoutField value={f.value} defaults={f.defaults} onChange={f.onChange} onArrange={f.onArrange} />
  {/if}
  {#if height}
    <MinHeightField value={height.value} onChange={height.onChange} />
  {/if}
  {#if grid}
    <GridColumnsField attrs={grid.attrs} onWidths={grid.onWidths} onTierColumns={grid.onTierColumns} onGap={grid.onGap} />
  {/if}
</BlockSettingsSection>

