<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A host passes its own `defaults` so the hints show what renders when a
  // field is unset. Align-content is disabled, not cleared, while the row
  // doesn't wrap, so wrapping again restores the last choice.
  import { editTier } from '$lib/features/content';
  import { FieldRow, SegmentedControl, SegmentedControlItem, Select } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    resolvedDisplay,
    resolvedFlexDirection,
    resolvedFlexWrap,
    resolvedJustifyContent,
    resolvedAlignItems,
    resolvedAlignContent,
    resolvedGap,
    resolvedArrangement,
    hasOwnArrangement,
    GAP_PRESETS,
    type LayoutArrangement,
    type LayoutData,
    type LayoutDefaults,
    type Display,
    type FlexDirection,
    type FlexWrap,
    type JustifyContent,
    type AlignItems,
    type AlignContent,
  } from '$lib/features/content';

  let {
    value,
    defaults = undefined,
    onChange,
    onArrange = undefined,
  }: {
    value: LayoutData | undefined;
    defaults?: LayoutDefaults;
    onChange: (
      field: 'display' | 'flexDirection' | 'flexWrap' | 'justifyContent' | 'alignItems' | 'alignContent' | 'gap',
      value: string | number | null
    ) => void;
    /** Sets the edited viewport's direction and wrap at once (setLayoutArrangement); null is Auto. */
    onArrange?: (arrangement: LayoutArrangement | null) => void;
  } = $props();

  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());

  const ownDisplay = $derived(value?.[bp]?.display ?? null);
  const ownDirection = $derived(value?.[bp]?.flexDirection ?? null);
  const ownWrap = $derived(value?.[bp]?.flexWrap ?? null);
  const ownJustify = $derived(value?.[bp]?.justifyContent ?? null);
  const ownAlignItems = $derived(value?.[bp]?.alignItems ?? null);
  const ownAlignContent = $derived(value?.[bp]?.alignContent ?? null);
  const ownGap = $derived(value?.[bp]?.gap ?? null);

  const resolvedWrapHint = $derived(resolvedFlexWrap(value, bp, defaults));
  // Lines to align exist only where the row wraps (a scrolling row is one line).
  const wrapEnabled = $derived(resolvedWrapHint === 'wrap' || resolvedWrapHint === 'wrap-reverse');
  const arrangement = $derived(resolvedArrangement(value, bp, defaults));
  const ownArrangement = $derived(hasOwnArrangement(value, bp));

  function hintFor(v: string): string {
    return bp === 'desktop' ? m.capability_common_default_inline({ value: v }) : m.capability_common_inherited_inline({ value: v });
  }

  const DISPLAY_OPTS: [Display, () => string][] = [
    ['flex', m.capability_layout_flex],
    ['inline-flex', m.capability_layout_inline_flex],
  ];
  // Arrows, not words: the German labels overflow the compact control.
  const DIRECTION_OPTS: [FlexDirection, string, () => string][] = [
    ['row', '→', m.capability_layout_row_title],
    ['row-reverse', '←', m.capability_layout_row_reverse_title],
    ['column', '↓', m.capability_layout_column_title],
    ['column-reverse', '↑', m.capability_layout_column_reverse_title],
  ];
  const WRAP_OPTS: [FlexWrap, string, () => string][] = [
    ['nowrap', 'wrap-off', m.capability_layout_nowrap],
    ['wrap', 'wrap-on', m.capability_layout_wrap_on],
    ['wrap-reverse', 'wrap-reverse', m.capability_layout_wrap_reverse],
    ['scroll', 'wrap-scroll', m.capability_layout_arrangement_scroll],
  ];
  // Direction and wrap of the edited viewport in one step.
  const ARRANGEMENT_OPTS: [LayoutArrangement, string, () => string][] = [
    ['row', 'flex-row', m.capability_layout_arrangement_row],
    ['stack', 'flex-column', m.capability_layout_arrangement_stack],
    ['wrap', 'wrap-on', m.capability_layout_arrangement_wrap],
    ['scroll', 'wrap-scroll', m.capability_layout_arrangement_scroll],
  ];
  const ARRANGEMENT_LABEL = Object.fromEntries(ARRANGEMENT_OPTS.map(([key, , label]) => [key, label])) as Record<LayoutArrangement, () => string>;
  const JUSTIFY_OPTS: [JustifyContent, () => string][] = [
    ['flex-start', m.capability_layout_start],
    ['flex-end', m.capability_layout_end],
    ['center', m.capability_layout_center],
    ['space-between', m.capability_layout_space_between],
    ['space-around', m.capability_layout_space_around],
    ['space-evenly', m.capability_layout_space_evenly],
  ];
  const ALIGN_ITEMS_OPTS: [AlignItems, () => string][] = [
    ['stretch', m.capability_layout_stretch],
    ['flex-start', m.capability_layout_start],
    ['flex-end', m.capability_layout_end],
    ['center', m.capability_layout_center],
    ['baseline', m.capability_layout_baseline],
  ];
  const ALIGN_CONTENT_OPTS: [AlignContent, () => string][] = [
    ['flex-start', m.capability_layout_start],
    ['flex-end', m.capability_layout_end],
    ['center', m.capability_layout_center],
    ['stretch', m.capability_layout_stretch],
    ['space-between', m.capability_layout_space_between],
    ['space-around', m.capability_layout_space_around],
  ];
  // Bits UI's Select treats '' as "nothing selected" and shows the
  // placeholder, so the Default option needs a non-empty value.
  const DEFAULT_SENTINEL = '__default__';
  const GAP_OPTS: [string, string, number][] = [
    ['none', '0', GAP_PRESETS.none],
    ['sm', 'S', GAP_PRESETS.sm],
    ['md', 'M', GAP_PRESETS.md],
    ['lg', 'L', GAP_PRESETS.lg],
  ];

  function defaultItem(resolved: string): { value: string; label: string } {
    return { value: DEFAULT_SENTINEL, label: bp === 'desktop' ? m.capability_common_default_value({ value: resolved }) : m.capability_common_inherit_tier() };
  }
</script>

{#if onArrange}
  {@const arrange = onArrange}
  <FieldRow layout="stack" label={m.capability_layout_arrangement()} info={m.capability_layout_arrangement_info()} hint={ownArrangement ? undefined : hintFor(ARRANGEMENT_LABEL[arrangement]())}>
    <SegmentedControl type="single" size="sm" stretch value={ownArrangement ? arrangement : ''} ariaLabel={m.capability_layout_arrangement()}>
      <SegmentedControlItem value="" onclick={() => arrange(null)} title={bp === 'desktop' ? m.capability_common_default_value({ value: ARRANGEMENT_LABEL[arrangement]() }) : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
      {#each ARRANGEMENT_OPTS as [key, iconName, label] (key)}
        <SegmentedControlItem value={key} onclick={() => arrange(key)} title={label()} aria-label={label()}><Icon name={iconName} size={15} /></SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </FieldRow>
{/if}

<FieldRow label={m.capability_layout_display()}>
  <SegmentedControl type="single" size="sm" value={ownDisplay ?? ''} ariaLabel={m.capability_layout_display()}>
    {#each DISPLAY_OPTS as [key, label] (key)}
      <SegmentedControlItem value={key} onclick={() => onChange('display', key)} title={label()}>{label()}</SegmentedControlItem>
    {/each}
    <SegmentedControlItem value="" onclick={() => onChange('display', null)} title={bp === 'desktop' ? m.capability_common_default_value({ value: resolvedDisplay(value, bp, defaults) }) : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
  </SegmentedControl>
</FieldRow>

<!-- Stacked, not inline: "Direction · Default column" beside four glyphs
     overflows the label column and would ellipsize the hint. -->
<FieldRow layout="stack" label={m.capability_layout_direction()} hint={ownDirection == null ? hintFor(resolvedFlexDirection(value, bp, defaults)) : undefined}>
  <SegmentedControl type="single" size="sm" stretch value={ownDirection ?? ''} ariaLabel={m.capability_layout_direction()}>
    {#each DIRECTION_OPTS as [key, glyph, title] (key)}
      <SegmentedControlItem value={key} onclick={() => onChange('flexDirection', key)} title={title()}>{glyph}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>

<FieldRow label={m.capability_layout_wrap()} hint={ownWrap == null ? hintFor(resolvedWrapHint) : undefined}>
  <SegmentedControl type="single" size="sm" value={ownWrap ?? ''} ariaLabel={m.capability_layout_wrap()}>
    {#each WRAP_OPTS as [key, iconName, title] (key)}
      <SegmentedControlItem value={key} onclick={() => onChange('flexWrap', key)} title={title()}><Icon name={iconName} size={15} /></SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>

<FieldRow layout="stack" label={m.capability_layout_justify()}>
  <Select
    size="sm"
    width="full"
    items={[defaultItem(resolvedJustifyContent(value, bp, defaults)), ...JUSTIFY_OPTS.map(([key, label]) => ({ value: key, label: label() }))]}
    value={ownJustify ?? DEFAULT_SENTINEL}
    onValueChange={(v) => onChange('justifyContent', v === DEFAULT_SENTINEL ? null : v)}
    ariaLabel={m.capability_layout_justify()}
  />
</FieldRow>

<FieldRow layout="stack" label={m.capability_layout_align_items()}>
  <Select
    size="sm"
    width="full"
    items={[defaultItem(resolvedAlignItems(value, bp, defaults)), ...ALIGN_ITEMS_OPTS.map(([key, label]) => ({ value: key, label: label() }))]}
    value={ownAlignItems ?? DEFAULT_SENTINEL}
    onValueChange={(v) => onChange('alignItems', v === DEFAULT_SENTINEL ? null : v)}
    ariaLabel={m.capability_layout_align_items()}
  />
</FieldRow>

<FieldRow layout="stack" label={m.capability_layout_align_content()} info={wrapEnabled ? undefined : m.capability_layout_align_content_disabled_hint()}>
  <Select
    size="sm"
    width="full"
    disabled={!wrapEnabled}
    items={[defaultItem(resolvedAlignContent(value, bp, defaults)), ...ALIGN_CONTENT_OPTS.map(([key, label]) => ({ value: key, label: label() }))]}
    value={ownAlignContent ?? DEFAULT_SENTINEL}
    onValueChange={(v) => onChange('alignContent', v === DEFAULT_SENTINEL ? null : v)}
    ariaLabel={m.capability_layout_align_content()}
  />
</FieldRow>

<FieldRow layout="stack" label={m.capability_layout_gap()} hint={ownGap == null ? hintFor(`${resolvedGap(value, bp)} px`) : undefined}>
  <SegmentedControl type="single" size="sm" stretch value={ownGap == null ? '' : String(ownGap)} ariaLabel={m.capability_layout_gap()}>
    <SegmentedControlItem value="" onclick={() => onChange('gap', null)} title={bp === 'desktop' ? m.capability_common_default_value({ value: `${resolvedGap(value, bp)}px` }) : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
    {#each GAP_OPTS as [key, label, px] (key)}
      <SegmentedControlItem value={String(px)} onclick={() => onChange('gap', px)} title={`${label} (${px}px)`}>{label}</SegmentedControlItem>
    {/each}
  </SegmentedControl>
</FieldRow>
