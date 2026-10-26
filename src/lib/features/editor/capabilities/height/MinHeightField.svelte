<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Below desktop, None takes back a larger tier's height; Auto stores nothing.
  import { FieldRow, NumberField, Select } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { editTier } from '$lib/features/content';
  import {
    convertMinHeight,
    formatMinHeight,
    parseMinHeight,
    resolvedMinHeight,
    setHeightField,
    MIN_HEIGHT_BOUNDS,
    MIN_HEIGHT_NONE,
    MIN_HEIGHT_PRESETS,
    MIN_HEIGHT_UNITS,
    type HeightData,
    type MinHeightUnit,
  } from '$lib/features/content';

  let { value, onChange }: {
    value: HeightData | null | undefined;
    onChange: (next: HeightData) => void;
  } = $props();

  // Bits UI's Select treats '' as "nothing selected" (see LayoutField.svelte).
  const AUTO = '__auto__';
  const CUSTOM = '__custom__';

  const bp = $derived($editTier);
  const own = $derived(value?.[bp]?.min ?? null);
  const resolved = $derived(resolvedMinHeight(value, bp));
  const above = $derived(bp === 'desktop' ? null : resolvedMinHeight(value, bp === 'tablet' ? 'desktop' : 'tablet'));
  const length = $derived(parseMinHeight(resolved));

  const PRESET_LABEL: Record<keyof typeof MIN_HEIGHT_PRESETS, () => string> = {
    s: m.capability_height_preset_s,
    m: m.capability_height_preset_m,
    l: m.capability_height_preset_l,
    screen: m.capability_height_preset_screen,
  };
  const presetKey = (v: string | null) => (Object.keys(MIN_HEIGHT_PRESETS) as (keyof typeof MIN_HEIGHT_PRESETS)[]).find((k) => MIN_HEIGHT_PRESETS[k] === v) ?? null;

  const items = $derived([
    {
      value: AUTO,
      label: bp === 'desktop' ? m.capability_common_auto() : m.capability_common_inherited_inline({ value: above ?? m.capability_height_none() }),
    },
    ...(bp === 'desktop' ? [] : [{ value: MIN_HEIGHT_NONE, label: m.capability_height_none() }]),
    ...(Object.keys(MIN_HEIGHT_PRESETS) as (keyof typeof MIN_HEIGHT_PRESETS)[]).map((k) => ({ value: k, label: `${PRESET_LABEL[k]()} · ${MIN_HEIGHT_PRESETS[k]}` })),
    { value: CUSTOM, label: m.capability_height_custom() },
  ]);
  const selected = $derived(own == null ? AUTO : own === MIN_HEIGHT_NONE ? MIN_HEIGHT_NONE : (presetKey(own) ?? CUSTOM));
  const UNIT_ITEMS = MIN_HEIGHT_UNITS.map((u) => ({ value: u, label: u }));

  function set(next: string | null) {
    onChange(setHeightField(value, bp, next));
  }

  function pick(v: string) {
    if (v === AUTO) set(null);
    else if (v === MIN_HEIGHT_NONE) set(MIN_HEIGHT_NONE);
    else if (v === CUSTOM) set(resolved ?? MIN_HEIGHT_PRESETS.m);
    else set(MIN_HEIGHT_PRESETS[v as keyof typeof MIN_HEIGHT_PRESETS]);
  }
</script>

<FieldRow layout="stack" label={m.capability_height_label()} info={m.capability_height_info()}>
  <Select size="sm" width="full" {items} value={selected} onValueChange={pick} ariaLabel={m.capability_height_label()} />
</FieldRow>
{#if own != null && own !== MIN_HEIGHT_NONE && length}
  {@const l = length}
  {@const bounds = MIN_HEIGHT_BOUNDS[l.unit]}
  <FieldRow layout="stack" label={m.capability_height_value_label()}>
    <div class="length">
      <NumberField
        size="sm"
        width="full"
        value={l.value}
        min={bounds.min}
        max={bounds.max}
        step={l.unit === 'rem' ? 0.5 : 1}
        ariaLabel={m.capability_height_value_label()}
        onValueChange={(v) => { if (v != null) set(formatMinHeight(v, l.unit)); }}
      />
      <Select size="sm" items={UNIT_ITEMS} value={l.unit} onValueChange={(u) => set(convertMinHeight(l, u as MinHeightUnit))} ariaLabel={m.capability_height_unit()} />
    </div>
  </FieldRow>
{/if}

<style>
  .length { display: flex; gap: var(--ds-space-sm); align-items: center; }
</style>
