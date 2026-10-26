<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A flex cell's size along its row (Auto, Fill with a weight, Fixed with a
  // size) and its alignment across it. Auto is content-sized and stores nothing.
  import { FieldRow, NumberField, SegmentedControl, SegmentedControlItem, Select } from '$lib/design-system';
  import {
    convertFlexBasis,
    editTier,
    formatFlexBasis,
    hasAnyOwnValue,
    parseFlexBasis,
    resolvedFlexItem,
    setFlexItemField,
    FLEX_BASIS_BOUNDS,
    FLEX_BASIS_UNITS,
    FLEX_ITEM_SELVES,
    FLEX_ITEM_WEIGHTS,
    type FlexBasisUnit,
    type FlexItemData,
    type FlexItemSelf,
    type FlexItemSize,
    type FlexItemValue,
  } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';

  let { value, onChange }: {
    value: FlexItemData | null | undefined;
    onChange: (next: FlexItemData) => void;
  } = $props();

  const bp = $derived($editTier);
  const autoLabel = $derived(bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherit());
  const own = $derived(value?.[bp] ?? {});
  const resolved = $derived(resolvedFlexItem(value, bp));
  // What an unset field shows: the larger tier's value below desktop.
  const above = $derived(bp === 'desktop' ? null : resolvedFlexItem(value, bp === 'tablet' ? 'desktop' : 'tablet'));
  const basis = $derived(parseFlexBasis(resolved.basis));

  const SIZE_LABEL: Record<FlexItemSize, () => string> = { fill: m.editor_flex_item_size_fill, fixed: m.editor_flex_item_size_fixed };
  const SELF_LABEL: Record<FlexItemSelf, () => string> = {
    start: m.editor_flex_item_self_start,
    center: m.editor_flex_item_self_center,
    end: m.editor_flex_item_self_end,
    stretch: m.editor_flex_item_self_stretch,
  };
  const UNIT_ITEMS = FLEX_BASIS_UNITS.map((u) => ({ value: u, label: u }));
  // Bits UI's Select treats '' as "nothing selected".
  const DEFAULT_SENTINEL = '__default__';

  const sizeHint = $derived(
    own.size || !above ? undefined : m.capability_common_inherited_inline({ value: above.size ? SIZE_LABEL[above.size]() : m.capability_common_auto() })
  );
  const selfItems = $derived([
    {
      value: DEFAULT_SENTINEL,
      label: above ? m.capability_common_inherited_inline({ value: above.self ? SELF_LABEL[above.self]() : m.capability_common_auto() }) : m.capability_common_auto(),
    },
    ...FLEX_ITEM_SELVES.map((s) => ({ value: s, label: SELF_LABEL[s]() })),
  ]);

  function set<K extends keyof FlexItemValue>(field: K, next: FlexItemValue[K] | null) {
    onChange(setFlexItemField(value, bp, field, next));
  }
</script>

<BlockSettingsSection id="flexItem" title={m.editor_block_settings_section_flex_item()} modified={hasAnyOwnValue(value ?? null)}>
  <FieldRow layout="stack" label={m.editor_flex_item_size_label()} hint={sizeHint} info={m.editor_flex_item_size_info()}>
    <SegmentedControl type="single" size="sm" stretch value={own.size ?? ''} ariaLabel={m.editor_flex_item_size_label()}>
      <SegmentedControlItem value="" onclick={() => set('size', null)} title={bp === 'desktop' ? m.editor_flex_item_size_auto_title() : m.capability_common_inherit_tier()}>{autoLabel}</SegmentedControlItem>
      <SegmentedControlItem value="fill" onclick={() => set('size', 'fill')}>{m.editor_flex_item_size_fill()}</SegmentedControlItem>
      <SegmentedControlItem value="fixed" onclick={() => set('size', 'fixed')}>{m.editor_flex_item_size_fixed()}</SegmentedControlItem>
    </SegmentedControl>
  </FieldRow>
  {#if resolved.size === 'fill'}
    <FieldRow label={m.editor_flex_item_weight_label()} info={m.editor_flex_item_weight_info()}>
      <SegmentedControl type="single" size="sm" value={String(resolved.weight)} ariaLabel={m.editor_flex_item_weight_label()}>
        {#each FLEX_ITEM_WEIGHTS as w (w)}
          <SegmentedControlItem value={String(w)} onclick={() => set('weight', w)}>{w}</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
  {:else if resolved.size === 'fixed' && basis}
    {@const b = basis}
    {@const bounds = FLEX_BASIS_BOUNDS[b.unit]}
    <FieldRow layout="stack" label={m.editor_flex_item_basis_label()} info={m.editor_flex_item_basis_info()}>
      <div class="basis">
        <NumberField
          size="sm"
          width="full"
          value={b.value}
          min={bounds.min}
          max={bounds.max}
          step={b.unit === 'rem' ? 0.5 : 1}
          ariaLabel={m.editor_flex_item_basis_label()}
          onValueChange={(v) => { if (v != null) set('basis', formatFlexBasis(v, b.unit)); }}
        />
        <Select size="sm" items={UNIT_ITEMS} value={b.unit} onValueChange={(u) => set('basis', convertFlexBasis(b, u as FlexBasisUnit))} ariaLabel={m.editor_flex_item_basis_unit()} />
      </div>
    </FieldRow>
  {/if}
  <FieldRow layout="stack" label={m.editor_flex_item_self_label()} info={m.editor_flex_item_self_info()}>
    <Select
      size="sm"
      width="full"
      items={selfItems}
      value={own.self ?? DEFAULT_SENTINEL}
      onValueChange={(v) => set('self', v === DEFAULT_SENTINEL ? null : (v as FlexItemSelf))}
      ariaLabel={m.editor_flex_item_self_label()}
    />
  </FieldRow>
</BlockSettingsSection>

<style>
  .basis { display: flex; gap: var(--ds-space-sm); align-items: center; }
</style>
