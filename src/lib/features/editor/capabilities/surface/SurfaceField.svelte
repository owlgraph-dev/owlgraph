<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The background's contrast warning is the caller's: it needs the block's
  // place in the page.
  import { editTier } from '$lib/features/content';
  import { FieldRow, SegmentedControl, SegmentedControlItem, ColorPickerField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { themeColorOptions } from '$lib/features/content';
  import { COLOR_SWATCHES } from '$lib/features/content';
  import {
    resolvedBg,
    resolvedBorder,
    resolvedRadius,
    resolvedShadow,
    RADIUS_PRESETS,
    NO_SURFACE_DEFAULTS,
    type SurfaceData,
    type SurfaceDefaults,
    type ShadowToken,
  } from '$lib/features/content';

  let {
    value,
    defaults = NO_SURFACE_DEFAULTS,
    onChange,
    fields = ['bg', 'border', 'radius', 'shadow'],
    bgWarning = null,
    bgLabel,
    onOverlayOpenChange,
  }: {
    value: SurfaceData | undefined;
    /** The block's group defaults (capabilities/defaults) — what each Auto row resolves to at desktop. */
    defaults?: SurfaceDefaults;
    onChange: (field: 'bg' | 'border' | 'radius' | 'shadow', value: string | number | null) => void;
    fields?: ('bg' | 'border' | 'radius' | 'shadow')[];
    /** Whether the default text reads on the background, at the selected viewport. */
    bgWarning?: string | null;
    /** The background row's label — under an image it is the colour fallback. */
    bgLabel?: string;
    /** The colour popovers' open state, for the editor's Escape handling. */
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());
  const noneTitle = $derived(bp === 'desktop' ? m.capability_common_default_none() : m.capability_common_inherit_tier());

  const ownBg = $derived(value?.[bp]?.bg ?? null);
  const ownBorder = $derived(value?.[bp]?.border ?? null);
  const ownRadius = $derived(value?.[bp]?.radius ?? null);
  const ownShadow = $derived(value?.[bp]?.shadow ?? null);

  const themeColors = themeColorOptions();
  const resolvedBgHint = $derived(resolvedBg(value, bp, defaults.bg));
  const resolvedBorderHint = $derived(resolvedBorder(value, bp, defaults.border));
  const resolvedRadiusHint = $derived(resolvedRadius(value, bp, defaults.radius));
  const resolvedShadowHint = $derived(resolvedShadow(value, bp, defaults.shadow));

  const RADIUS_OPTS: [string, () => string, number][] = [
    ['none', m.capability_surface_radius_none, RADIUS_PRESETS.none],
    ['sm', m.capability_surface_radius_sm, RADIUS_PRESETS.sm],
    ['md', m.capability_surface_radius_md, RADIUS_PRESETS.md],
    ['lg', m.capability_surface_radius_lg, RADIUS_PRESETS.lg],
  ];
  const SHADOW_OPTS: [ShadowToken, () => string][] = [
    ['none', m.capability_surface_shadow_none],
    ['sm', m.capability_surface_shadow_sm],
    ['md', m.capability_surface_shadow_md],
    ['lg', m.capability_surface_shadow_lg],
  ];

  function hintFor(v: string): string {
    return bp === 'desktop' ? m.capability_common_default_inline({ value: v }) : m.capability_common_inherited_inline({ value: v });
  }
  const shadowLabel = $derived(SHADOW_OPTS.find(([k]) => k === resolvedShadowHint)?.[1]() ?? String(resolvedShadowHint));
</script>

{#if fields.includes('bg')}
  <FieldRow layout={bgLabel ? 'stack' : 'inline'} label={bgLabel ?? m.capability_surface_background()} warning={bgWarning}>
    <ColorPickerField swatches={COLOR_SWATCHES}
      value={ownBg}
      resolved={resolvedBgHint || null}
      onValueChange={(c) => onChange('bg', c)}
      noneLabel={autoLabel}
      {noneTitle}
      customTitle={m.capability_common_custom_color()}
      themeColors={themeColors}
      themeLabel={m.capability_color_theme()}
      customLabel={m.capability_color_custom()}
      ariaLabel={bgLabel ?? m.capability_surface_background()}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
    />
  </FieldRow>
{/if}

{#if fields.includes('border')}
  <FieldRow label={m.capability_surface_border()}>
    <ColorPickerField swatches={COLOR_SWATCHES}
      value={ownBorder}
      resolved={resolvedBorderHint || null}
      onValueChange={(c) => onChange('border', c)}
      noneLabel={autoLabel}
      {noneTitle}
      customTitle={m.capability_common_custom_color()}
      themeColors={themeColors}
      themeLabel={m.capability_color_theme()}
      customLabel={m.capability_color_custom()}
      ariaLabel={m.capability_surface_border()}
      onOpenChange={(o) => onOverlayOpenChange?.(o)}
    />
  </FieldRow>
{/if}

{#if fields.includes('radius')}
  <FieldRow layout="stack" label={m.capability_surface_radius()} hint={ownRadius == null ? hintFor(`${resolvedRadiusHint} px`) : undefined}>
    <SegmentedControl type="single" size="sm" stretch value={ownRadius == null ? '' : String(ownRadius)} ariaLabel={m.capability_surface_radius()}>
      <SegmentedControlItem value="" onclick={() => onChange('radius', null)} title={bp === 'desktop' ? m.capability_common_default_value({ value: `${defaults.radius ?? 0}px` }) : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
      {#each RADIUS_OPTS as [key, label, px] (key)}
        <SegmentedControlItem value={String(px)} onclick={() => onChange('radius', px)} title={`${label()} (${px}px)`}>{label()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
{/if}

{#if fields.includes('shadow')}
  <FieldRow layout="stack" label={m.capability_surface_shadow()} hint={ownShadow == null ? hintFor(shadowLabel) : undefined}>
    <SegmentedControl type="single" size="sm" stretch value={ownShadow ?? ''} ariaLabel={m.capability_surface_shadow()}>
      <SegmentedControlItem value="" onclick={() => onChange('shadow', null)} title={bp === 'desktop' ? m.capability_common_default_none() : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
      {#each SHADOW_OPTS as [key, label] (key)}
        <SegmentedControlItem value={key} onclick={() => onChange('shadow', key)} title={label()}>{label()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
{/if}
