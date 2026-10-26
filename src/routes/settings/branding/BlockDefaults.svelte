<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The capability defaults (docs/architecture/blocks/capabilities.md, "Capability defaults"): a row per
  // capability, a column per block-type group, in steps and theme colours only
  // so a default adapts to every scheme. One draft, saved together. The canvas
  // widths are px and the page gutters a step per tier, each in a row below.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button, FieldRow, NumberField, SegmentedControl, SegmentedControlItem, Select, SettingsRow, SettingsGroup, Table, TableRow, TableCell, toast, type TableColumn } from '$lib/design-system';
  import type { StoredTheme } from '$lib/design-system/theme/siteTheme';
  import {
    BUILTIN_BLOCK_DEFAULTS,
    BUILTIN_WIDTHS,
    DEFAULTS_UI_GROUPS,
    GROUP_DEFAULT_FIELDS,
    normalizeBlockDefaults,
    stepPx,
    themeColorOptions,
    type BlockGroup,
    type GroupDefaults,
    type ShadowToken,
    type StepToken,
    type StoredBlockDefaults,
    type WidthToken,
    type Tier,
    WIDTH_BOUNDS,
    WIDTH_TOKENS,
    TIERS,
    BUILTIN_GUTTERS,
  } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';

  let { theme }: { theme: StoredTheme } = $props();

  type Field = keyof GroupDefaults;
  const FIELDS: Field[] = ['pad', 'radius', 'shadow', 'border', 'bg', 'blockSpace'];
  const STEP_FAMILY = { pad: 'pad', radius: 'radius', blockSpace: 'rhythm' } as const;

  const initial = untrack(() => normalizeBlockDefaults(theme.blockDefaults));
  let page = $state<StepToken | null>(initial.page?.blockSpace ?? null);
  // The canvas widths, px; null = the built-in (the field's placeholder).
  let widths = $state<Record<WidthToken, number | null>>({
    read: initial.page?.widths?.read ?? null,
    wide: initial.page?.widths?.wide ?? null,
    max: initial.page?.widths?.max ?? null,
  });
  // The page gutters, a step per tier; null = the built-in.
  let gutters = $state<Record<Tier, StepToken | null>>({
    desktop: initial.page?.gutters?.desktop ?? null,
    tablet: initial.page?.gutters?.tablet ?? null,
    phone: initial.page?.gutters?.phone ?? null,
  });
  let groups = $state<Record<BlockGroup, GroupDefaults>>({
    text: { ...(initial.groups?.text ?? {}) },
    containers: { ...(initial.groups?.containers ?? {}) },
    media: { ...(initial.groups?.media ?? {}) },
    cards: { ...(initial.groups?.cards ?? {}) },
  });
  let saving = $state(false);

  const draftWidths = $derived(Object.fromEntries(WIDTH_TOKENS.filter((w) => widths[w] != null).map((w) => [w, widths[w]])));
  const draftGutters = $derived(Object.fromEntries(TIERS.filter((t) => gutters[t] != null).map((t) => [t, gutters[t]])));
  const draftPage = $derived({
    ...(page ? { blockSpace: page } : {}),
    ...(Object.keys(draftWidths).length ? { widths: draftWidths } : {}),
    ...(Object.keys(draftGutters).length ? { gutters: draftGutters } : {}),
  });
  const draft = $derived<StoredBlockDefaults>({
    ...(Object.keys(draftPage).length ? { page: draftPage } : {}),
    groups: Object.fromEntries(Object.entries(groups).filter(([, g]) => Object.keys(g).length > 0)) as StoredBlockDefaults['groups'],
  });
  const payload = $derived(JSON.stringify(draft));

  // Select has no empty item, so Auto is a sentinel mapped back to "unset".
  const AUTO = '__auto__';
  const NONE = '__none__';
  const themeColors = themeColorOptions();
  const colorItems = $derived([{ value: AUTO, label: m.capability_common_auto() }, ...themeColors.map((c) => ({ value: c.value, label: c.label }))]);

  const fieldLabel: Record<Field, () => string> = {
    pad: m.settings_branding_block_defaults_field_pad,
    radius: m.settings_branding_block_defaults_field_radius,
    shadow: m.settings_branding_block_defaults_field_shadow,
    border: m.settings_branding_block_defaults_field_border,
    bg: m.settings_branding_block_defaults_field_bg,
    blockSpace: m.settings_branding_block_defaults_field_block_space,
  };
  const widthLabel: Record<WidthToken, () => string> = {
    read: m.settings_branding_block_defaults_width_read,
    wide: m.settings_branding_block_defaults_width_wide,
    max: m.settings_branding_block_defaults_width_max,
  };
  const gutterLabel: Record<Tier, () => string> = {
    desktop: m.settings_branding_block_defaults_gutter_desktop,
    tablet: m.settings_branding_block_defaults_gutter_tablet,
    phone: m.settings_branding_block_defaults_gutter_phone,
  };
  const groupLabel: Record<BlockGroup, () => string> = {
    text: m.settings_branding_block_defaults_group_text,
    containers: m.settings_branding_block_defaults_group_containers,
    media: m.settings_branding_block_defaults_group_media,
    cards: m.settings_branding_block_defaults_group_cards,
  };
  const STEPS: { key: StepToken; label: () => string }[] = [
    { key: 'none', label: m.capability_spacing_preset_none },
    { key: 'sm', label: m.capability_spacing_preset_sm },
    { key: 'md', label: m.capability_spacing_preset_md },
    { key: 'lg', label: m.capability_spacing_preset_lg },
  ];
  const SHADOWS: { key: ShadowToken; label: () => string }[] = [
    { key: 'none', label: m.capability_surface_shadow_none },
    { key: 'sm', label: m.capability_surface_shadow_sm },
    { key: 'md', label: m.capability_surface_shadow_md },
    { key: 'lg', label: m.capability_surface_shadow_lg },
  ];

  // What Auto stands for in a cell: the built-in default, as the block settings panel shows it.
  function builtinLabel(group: BlockGroup | 'page', field: Field): string {
    const builtin = group === 'page' ? BUILTIN_BLOCK_DEFAULTS.page.blockSpace : BUILTIN_BLOCK_DEFAULTS.groups[group][field];
    if (builtin == null || builtin === 'none') return m.capability_common_default_none();
    if (field === 'shadow') return m.capability_common_default_value({ value: SHADOWS.find((s) => s.key === builtin)?.label() ?? String(builtin) });
    if (field === 'bg' || field === 'border') return m.capability_common_default_value({ value: themeColors.find((c) => c.value === builtin)?.label ?? String(builtin) });
    return m.capability_common_default_value({ value: `${stepPx(STEP_FAMILY[field as keyof typeof STEP_FAMILY], builtin as StepToken)} px` });
  }

  function setField(group: BlockGroup, field: Field, value: string | null) {
    const next = { ...groups[group] };
    if (value == null || value === '' || value === AUTO) delete next[field];
    else (next as Record<string, unknown>)[field] = value;
    groups[group] = next;
  }

  const columns = $derived<TableColumn[]>([
    { label: m.settings_branding_block_defaults_col_capability(), width: '10rem' },
    { label: m.settings_branding_block_defaults_group_page(), width: '14rem' },
    ...DEFAULTS_UI_GROUPS.map((g) => ({ label: groupLabel[g](), width: '14rem' })),
  ]);
</script>

<SettingsGroup title={m.settings_branding_block_defaults_heading()} intro={m.settings_branding_block_defaults_intro()}>
  <SettingsRow label={m.settings_branding_block_defaults_matrix_label()} description={m.settings_branding_block_defaults_matrix_desc()} layout="wide">
    <Table {columns} minWidth="52rem" ariaLabel={m.settings_branding_block_defaults_heading()}>
      {#each FIELDS as field (field)}
        <TableRow>
          <TableCell>{fieldLabel[field]()}</TableCell>
          <TableCell>
            {#if field === 'blockSpace'}
              <SegmentedControl type="single" size="sm" stretch value={page ?? ''} ariaLabel={`${m.settings_branding_block_defaults_group_page()} · ${fieldLabel[field]()}`}>
                <SegmentedControlItem value="" onclick={() => (page = null)} title={builtinLabel('page', field)}>{m.capability_common_auto()}</SegmentedControlItem>
                {#each STEPS as step (step.key)}
                  <SegmentedControlItem value={step.key} onclick={() => (page = step.key)} title={`${stepPx('rhythm', step.key)} px`}>{step.label()}</SegmentedControlItem>
                {/each}
              </SegmentedControl>
            {:else}
              <span class="na" aria-hidden="true">–</span>
            {/if}
          </TableCell>
          {#each DEFAULTS_UI_GROUPS as group (group)}
            <TableCell>
              {#if !GROUP_DEFAULT_FIELDS[group].includes(field)}
                <span class="na" aria-hidden="true">–</span>
              {:else if field === 'bg' || field === 'border'}
                <Select
                  size="sm"
                  width="full"
                  items={colorItems}
                  value={groups[group][field] ?? AUTO}
                  onValueChange={(v) => setField(group, field, v)}
                  ariaLabel={`${groupLabel[group]()} · ${fieldLabel[field]()}`}
                />
              {:else if field === 'shadow'}
                <SegmentedControl type="single" size="sm" stretch value={groups[group].shadow ?? ''} ariaLabel={`${groupLabel[group]()} · ${fieldLabel[field]()}`}>
                  <SegmentedControlItem value="" onclick={() => setField(group, field, null)} title={builtinLabel(group, field)}>{m.capability_common_auto()}</SegmentedControlItem>
                  {#each SHADOWS as shadow (shadow.key)}
                    <SegmentedControlItem value={shadow.key} onclick={() => setField(group, field, shadow.key)} title={shadow.label()}>{shadow.label()}</SegmentedControlItem>
                  {/each}
                </SegmentedControl>
              {:else}
                {@const family = STEP_FAMILY[field as keyof typeof STEP_FAMILY]}
                <SegmentedControl type="single" size="sm" stretch value={groups[group][field] ?? ''} ariaLabel={`${groupLabel[group]()} · ${fieldLabel[field]()}`}>
                  <SegmentedControlItem value="" onclick={() => setField(group, field, null)} title={builtinLabel(group, field)}>{m.capability_common_auto()}</SegmentedControlItem>
                  {#each STEPS as step (step.key)}
                    <SegmentedControlItem value={step.key} onclick={() => setField(group, field, step.key)} title={`${stepPx(family, step.key)} px`}>{step.label()}</SegmentedControlItem>
                  {/each}
                </SegmentedControl>
              {/if}
            </TableCell>
          {/each}
        </TableRow>
      {/each}
    </Table>
  </SettingsRow>

  <SettingsRow label={m.settings_branding_block_defaults_widths_label()} description={m.settings_branding_block_defaults_widths_desc()}>
    <div class="widths">
      {#each WIDTH_TOKENS as w (w)}
        <FieldRow label={widthLabel[w]()}>
          <NumberField
            size="sm"
            unit="px"
            min={WIDTH_BOUNDS[w].min}
            max={WIDTH_BOUNDS[w].max}
            value={widths[w]}
            placeholder={String(BUILTIN_WIDTHS[w])}
            ariaLabel={widthLabel[w]()}
            onValueChange={(v) => (widths[w] = v)}
          />
        </FieldRow>
      {/each}
    </div>
  </SettingsRow>

  <SettingsRow label={m.settings_branding_block_defaults_gutters_label()} description={m.settings_branding_block_defaults_gutters_desc()}>
    <div class="widths">
      {#each TIERS as tier (tier)}
        <FieldRow label={gutterLabel[tier]()} layout="stack">
          <SegmentedControl type="single" size="sm" stretch value={gutters[tier] ?? ''} ariaLabel={gutterLabel[tier]()}>
            <SegmentedControlItem value="" onclick={() => (gutters[tier] = null)} title={m.capability_common_default_value({ value: `${stepPx('gutter', BUILTIN_GUTTERS[tier])} px` })}>{m.capability_common_auto()}</SegmentedControlItem>
            {#each STEPS as step (step.key)}
              <SegmentedControlItem value={step.key} onclick={() => (gutters[tier] = step.key)} title={`${stepPx('gutter', step.key)} px`}>{step.label()}</SegmentedControlItem>
            {/each}
          </SegmentedControl>
        </FieldRow>
      {/each}
    </div>
  </SettingsRow>

  <div class="actions">
    <form
      method="POST"
      action="?/resetBlockDefaults"
      use:enhance={() => async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') {
          page = null;
          widths = { read: null, wide: null, max: null };
          gutters = { desktop: null, tablet: null, phone: null };
          groups = { text: {}, containers: {}, media: {}, cards: {} };
          toast.success(m.settings_branding_block_defaults_saved());
        }
      }}
    >
      <Button type="submit" variant="ghost-danger">{m.settings_branding_block_defaults_reset()}</Button>
    </form>
    <form
      method="POST"
      action="?/saveBlockDefaults"
      use:enhance={() => {
        saving = true;
        return async ({ result, update }) => {
          await update({ reset: false });
          saving = false;
          if (result.type === 'success') toast.success(m.settings_branding_block_defaults_saved());
        };
      }}
    >
      <input type="hidden" name="blockDefaults" value={payload} />
      <Button type="submit" variant="primary" loading={saving}>{m.settings_branding_block_defaults_save()}</Button>
    </form>
  </div>
</SettingsGroup>

<style>
  .na { color: var(--ds-color-muted); }
  .widths { display: flex; flex-direction: column; gap: var(--ds-space-sm); max-width: 20rem; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--ds-space-sm); padding-top: var(--ds-space-md); }
</style>
