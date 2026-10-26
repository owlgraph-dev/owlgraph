<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The rows in the order the values compose: the flow's rhythm, the block's
  // space above, its padding. The page's gutter lives in its layout, not its
  // spacing bag.
  import SpacingField from '../capabilities/spacing/SpacingField.svelte';
  import SpaceField from '../capabilities/spacing/SpaceField.svelte';
  import GutterField from '../capabilities/spacing/GutterField.svelte';
  import { Button } from '$lib/design-system';
  import { BLOCK_SPACE_PRESETS, SPACE_ABOVE_PRESETS, editTier, hasAnyOwnValue, hasOwnValueAt, pageGutter, type PageLayout, type SpaceField as SpaceFieldName, type SpacingData, type Side } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';

  let {
    value,
    defaultPad,
    inheritedRhythm = null,
    rows = { blockSpace: false, spaceAbove: false, pad: true },
    gutter,
    onChange,
    onReset,
    onOverlayOpenChange,
  }: {
    value: SpacingData | undefined;
    /** The group default the padding row's Auto resolves to; null = none. */
    defaultPad: number | null;
    /** The rhythm this flow inherits when it sets none: the ancestor flow's, else the theme's page rhythm. */
    inheritedRhythm?: number | null;
    /** Sets every field of the edited tier back to Auto. */
    onReset?: () => void;
    rows?: { blockSpace?: boolean; spaceAbove?: boolean; pad?: boolean };
    onChange: (field: 'pad' | Side | SpaceFieldName, value: number | null) => void;
    /** The page's gutter row: its layout, the site's gutter per tier (px), and the setter for the edited tier. */
    gutter?: { value: PageLayout | undefined; site: Record<'desktop' | 'tablet' | 'phone', number>; onChange: (gutter: string | null) => void };
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const gutterModified = $derived(!!gutter && (['desktop', 'tablet', 'phone'] as const).some((bp) => pageGutter(gutter.value, bp) != null));
  const gutterOwnHere = $derived(!!gutter && pageGutter(gutter.value, $editTier) != null);

  // One preset vocabulary (0/S/M/L) on different scales: a rhythm and a
  // one-off override aren't the same size.
  const PRESET_LABELS = [
    { key: 'none', label: m.capability_spacing_preset_none(), title: m.capability_spacing_preset_none_title() },
    { key: 'sm', label: m.capability_spacing_preset_sm(), title: m.capability_spacing_preset_sm_title() },
    { key: 'md', label: m.capability_spacing_preset_md(), title: m.capability_spacing_preset_md_title() },
    { key: 'lg', label: m.capability_spacing_preset_lg(), title: m.capability_spacing_preset_lg_title() },
  ] as const;
  const presetsFrom = (sizes: Record<string, number>) =>
    PRESET_LABELS.map((p) => ({ value: sizes[p.key], label: p.label, title: p.title }));
</script>

<BlockSettingsSection id="spacing" title={m.editor_block_settings_section_spacing()} modified={hasAnyOwnValue(value) || gutterModified}>
  {#if rows.blockSpace}
    <SpaceField
      {value}
      field="blockSpace"
      label={m.capability_spacing_block_space_label()}
      presets={presetsFrom(BLOCK_SPACE_PRESETS)}
      info={m.capability_spacing_block_space_hint()}
      fallback={inheritedRhythm}
      {onChange}
    />
  {/if}
  {#if rows.spaceAbove}
    <SpaceField
      {value}
      field="spaceAbove"
      label={m.capability_spacing_space_above_label()}
      presets={presetsFrom(SPACE_ABOVE_PRESETS)}
      info={m.capability_spacing_space_above_auto_hint()}
      {onChange}
    />
  {/if}
  {#if rows.pad}
    <SpacingField {value} fallback={defaultPad} {onChange} {onOverlayOpenChange} />
  {/if}
  {#if gutter}
    <GutterField value={gutter.value} site={gutter.site} onChange={gutter.onChange} {onOverlayOpenChange} />
  {/if}
  {#if onReset && (hasOwnValueAt(value, $editTier) || gutterOwnHere)}
    <div class="reset"><Button size="sm" variant="ghost" onclick={onReset}>{m.editor_block_settings_reset_auto()}</Button></div>
  {/if}
</BlockSettingsSection>

<style>
  .reset { display: flex; justify-content: flex-end; }
</style>
