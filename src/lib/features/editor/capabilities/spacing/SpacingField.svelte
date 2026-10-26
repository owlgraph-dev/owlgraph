<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The uniform picker writes `pad` and clears the per-side overrides under it
  // (setSpacingField), so the two never disagree.
  import { editTier } from '$lib/features/content';
  import { FieldRow, SegmentedControl, SegmentedControlItem, Popover, NumberField, TriggerFace } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { resolvedPad, resolvedSide, type SpacingData, type Side } from '$lib/features/content';

  let {
    value,
    fallback,
    label = m.capability_spacing_label_default(),
    sides = ['top', 'right', 'bottom', 'left'],
    presets = [
      { value: 0, label: m.capability_spacing_preset_none(), title: m.capability_spacing_preset_none_title() },
      { value: 8, label: m.capability_spacing_preset_sm(), title: m.capability_spacing_preset_sm_title() },
      { value: 16, label: m.capability_spacing_preset_md(), title: m.capability_spacing_preset_md_title() },
      { value: 24, label: m.capability_spacing_preset_lg(), title: m.capability_spacing_preset_lg_title() },
    ],
    onChange,
    onOverlayOpenChange,
  }: {
    value: SpacingData | undefined;
    /** The block's group default (capabilities/defaults) — what Auto resolves to at desktop; null = no padding. */
    fallback: number | null;
    label?: string;
    sides?: Side[];
    presets?: { value: number; label: string; title: string }[];
    onChange: (field: 'pad' | Side, value: number | null) => void;
    /** The per-side popover's open state, for the editor's Escape handling. */
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const SIDE_LABELS: Record<Side, () => string> = {
    top: m.capability_spacing_side_top,
    right: m.capability_spacing_side_right,
    bottom: m.capability_spacing_side_bottom,
    left: m.capability_spacing_side_left,
  };

  const bp = $derived($editTier);
  const ownPad = $derived(value?.[bp]?.pad ?? null);
  const padFallback = $derived(fallback ?? 0);
  const resolved = $derived(resolvedPad(value, bp, padFallback));
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());
  const sideOverrideCount = $derived(sides.filter((s) => value?.[bp]?.[s] != null).length);
  const hint = $derived(
    ownPad == null
      ? bp === 'desktop'
        ? m.capability_common_default_inline({ value: `${resolved} px` })
        : m.capability_common_inherited_inline({ value: `${resolved} px` })
      : undefined
  );

  let sidesOpen = $state(false);

  function ownSide(s: Side): number | null {
    return value?.[bp]?.[s] ?? null;
  }
</script>

<FieldRow layout="stack" {label} {hint}>
  {#snippet trailing()}
    <Popover
      bind:open={sidesOpen}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
      side="bottom"
      align="end"
      triggerProps={{ 'aria-label': m.capability_spacing_customize_sides(), title: m.capability_spacing_customize_sides() }}
    >
      {#snippet trigger()}
        <!-- Tinted while any side is overridden. -->
        <TriggerFace variant="toolbar" size="sm" active={sideOverrideCount > 0}>
          <Icon name="sliders" size={14} />
          {#if sideOverrideCount > 0}<span class="sf-sides-count">{sideOverrideCount}</span>{/if}
        </TriggerFace>
      {/snippet}
      <div class="sf-box" class:sf-box-2={sides.length === 2}>
        {#each sides as s (s)}
          <div class="sf-side sf-side-{s}">
            <span class="sf-side-label">{SIDE_LABELS[s]()}</span>
            <NumberField size="sm"
              value={ownSide(s)}
              min={0}
              max={200}
              unit="px"
              placeholder={String(resolvedSide(value, bp, s, fallback))}
              ariaLabel={SIDE_LABELS[s]()}
              onValueChange={(v) => onChange(s, v)}
            />
          </div>
        {/each}
      </div>
    </Popover>
  {/snippet}
  <SegmentedControl type="single" size="sm" stretch value={ownPad == null ? '' : String(ownPad)} ariaLabel={label}>
    <SegmentedControlItem
      value=""
      onclick={() => onChange('pad', null)}
      title={bp === 'desktop' ? m.capability_common_default_value({ value: `${padFallback}px` }) : m.capability_common_inherit_tier()}
    >{autoLabel}</SegmentedControlItem>
    {#each presets as p (p.value)}
      <SegmentedControlItem value={String(p.value)} onclick={() => onChange('pad', p.value)} title={p.title}>{p.label}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>

<style>
  .sf-sides-count { font-weight: var(--ds-weight-semibold); }
  .sf-box { display: grid; grid-template-columns: auto auto auto; grid-template-areas: ". top ." "left . right" ". bottom ."; gap: 0.35rem; padding: 0.3rem; }
  .sf-box.sf-box-2 { display: flex; grid-template-areas: none; gap: 0.5rem; }
  .sf-side { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; }
  .sf-side-label { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .sf-side-top { grid-area: top; }
  .sf-side-right { grid-area: right; }
  .sf-side-bottom { grid-area: bottom; }
  .sf-side-left { grid-area: left; }
  .sf-side :global(.ds-numfield) { width: 4.6rem; }
</style>
