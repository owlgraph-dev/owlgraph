<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A chosen page layout is copied into the page, which doesn't follow later
  // changes and reads "customized" once they differ (docs/architecture/blocks/layout.md, "Page
  // layout: sections"). Switching between flow and columns rewrites the
  // content, so it asks first. A width caps a fluid column, so one value
  // serves every viewport.
  import { FieldRow, NumberField, SegmentedControl, SegmentedControlItem, Select, Button, Dialog } from '$lib/design-system';
  import {
    convertPageWidth,
    formatLength,
    LENGTH_UNITS,
    PAGE_WIDTH_BOUNDS,
    PAGE_WIDTH_KEYS,
    pageWidth,
    parseLength,
    setPageWidth,
    editTier,
    GAP_STEPS,
    pageColumnsOf,
    CUSTOM_PRESET_ID,
    STANDARD_PRESET_ID,
    type LengthUnit,
    type PageColumns,
    type PageLayout,
    type PageWidthKey,
    type SpaceToken,
  } from '$lib/features/content';
  import { presetName, presetSnapshot, resolvePageLayoutPreset, type PageLayoutPreset } from '$lib/features/pages';
  import { ColumnTemplateField, PageLayoutThumbnail } from '$lib/features/pages/components';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from './BlockSettingsSection.svelte';

  let { value, presets, siteWidths, onChange, onColumns, onOverlayOpenChange }: {
    value: PageLayout | undefined;
    presets: readonly PageLayoutPreset[];
    /** The site's widths in px (capability defaults): what Auto renders. */
    siteWidths: Record<PageWidthKey, number>;
    onChange: (next: PageLayout) => void;
    /** Applies a new columns layout (or flow, with null), converting or reconciling the content as one undo step. */
    onColumns: (next: PageColumns | null) => void;
    onOverlayOpenChange?: (open: boolean) => void;
  } = $props();

  const columns = $derived(pageColumnsOf(value));
  const enabled = $derived(presets.filter((p) => p.enabled));
  const resolution = $derived(resolvePageLayoutPreset(columns, presets));
  const selected = $derived(resolution.preset?.id ?? (columns ? CUSTOM_PRESET_ID : STANDARD_PRESET_ID));
  const bp = $derived($editTier);

  const items = $derived([...enabled.map((p) => ({ value: p.id, label: presetName(p) })), { value: CUSTOM_PRESET_ID, label: m.editor_page_layout_custom() }]);
  const GAP_LABEL: Record<SpaceToken, () => string> = {
    none: m.capability_spacing_preset_none,
    sm: m.capability_spacing_preset_sm,
    md: m.capability_spacing_preset_md,
    lg: m.capability_spacing_preset_lg,
  };

  // A new custom layout starts from two equal columns, stacked on a phone.
  const CUSTOM_START: PageColumns = { mode: 'columns', template: { desktop: [1, 1], tablet: [1, 1], phone: [1] }, preset: CUSTOM_PRESET_ID };

  function thumbTemplate(id: string) {
    if (id === CUSTOM_PRESET_ID) return (columns ?? CUSTOM_START).template;
    return enabled.find((p) => p.id === id)?.template ?? null;
  }

  let pending = $state<{ next: PageColumns | null; wrap: boolean } | null>(null);

  function pickPreset(id: string) {
    if (id === selected) return;
    if (id === CUSTOM_PRESET_ID) {
      // The values stay, the layout they came from goes.
      if (!columns) pending = { next: CUSTOM_START, wrap: true };
      else {
        const { presetLabel: _provenance, ...own } = columns;
        onColumns({ ...own, preset: CUSTOM_PRESET_ID });
      }
      return;
    }
    const preset = enabled.find((p) => p.id === id);
    if (!preset) return;
    const next = presetSnapshot(preset);
    if (!next) {
      if (columns) pending = { next: null, wrap: false };
      return;
    }
    if (!columns) pending = { next, wrap: true };
    else onColumns(next);
  }

  function reapply() {
    const next = resolution.preset && presetSnapshot(resolution.preset);
    if (next) onColumns(next);
  }

  function confirmPending() {
    const p = pending;
    pending = null;
    if (p) onColumns(p.next);
  }

  // Keeps the layout it came from, so the page reads "customized".
  function editTemplate(template: PageColumns['template']) {
    if (columns) onColumns({ ...columns, template });
  }

  function setGap(step: SpaceToken | null) {
    if (!columns) return;
    const gap = { ...(columns.gap ?? {}) };
    if (step) gap[bp] = step;
    else delete gap[bp];
    onColumns({ ...columns, gap });
  }

  const LABEL: Record<PageWidthKey, () => string> = { read: m.editor_page_width_read, wide: m.editor_page_width_wide };
  const INFO: Record<PageWidthKey, () => string> = { read: m.editor_page_width_read_info, wide: m.editor_page_width_wide_info };
  const UNIT_ITEMS = LENGTH_UNITS.map((u) => ({ value: u, label: u }));

  const modified = $derived(PAGE_WIDTH_KEYS.some((key) => pageWidth(value, key) != null));

  function set(key: PageWidthKey, next: string | null) {
    onChange(setPageWidth(value, key, next));
  }
</script>

{#snippet thumbnail(id: string)}
  <PageLayoutThumbnail template={thumbTemplate(id)} />
{/snippet}

<BlockSettingsSection id="layout" title={m.editor_block_settings_section_layout()} modified={modified || !!columns}>
  <FieldRow layout="stack" label={m.editor_page_layout_label()} info={m.editor_page_layout_info()} hint={resolution.customized ? m.editor_page_layout_customized() : undefined}>
    <div class="layout">
      <Select size="sm" width="full" {items} value={selected} onValueChange={pickPreset} leading={thumbnail} ariaLabel={m.editor_page_layout_label()} />
      {#if resolution.customized}
        <Button size="sm" variant="secondary" onclick={reapply} title={m.editor_page_layout_reapply_title({ label: resolution.preset ? presetName(resolution.preset) : '' })}>{m.editor_page_layout_reapply()}</Button>
      {/if}
    </div>
  </FieldRow>
  {#if columns}
    <ColumnTemplateField template={columns.template} tier={bp} onChange={editTemplate} />
    <FieldRow layout="stack" label={m.editor_page_columns_gap()}>
      <SegmentedControl type="single" size="sm" stretch value={columns.gap?.[bp] ?? ''} ariaLabel={m.editor_page_columns_gap()}>
        <SegmentedControlItem value="" onclick={() => setGap(null)}>{m.capability_common_auto()}</SegmentedControlItem>
        {#each GAP_STEPS as step (step)}
          <SegmentedControlItem value={step} onclick={() => setGap(step)}>{GAP_LABEL[step]()}</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
  {/if}
  {#each PAGE_WIDTH_KEYS as key (key)}
    {@const own = pageWidth(value, key)}
    {@const length = parseLength(own)}
    {@const label = LABEL[key]()}
    <FieldRow
      layout="stack"
      {label}
      hint={own ? undefined : m.capability_common_default_inline({ value: `${siteWidths[key]} px` })}
      info={INFO[key]()}
    >
      <div class="width">
        <SegmentedControl type="single" size="sm" stretch value={own ? 'custom' : ''} ariaLabel={label}>
          <SegmentedControlItem value="" onclick={() => set(key, null)} title={m.capability_common_default_inline({ value: `${siteWidths[key]} px` })}>{m.capability_common_auto()}</SegmentedControlItem>
          <SegmentedControlItem value="custom" onclick={() => { if (!own) set(key, `${siteWidths[key]}px`); }} title={m.editor_page_width_custom_title()}>{m.editor_page_width_custom()}</SegmentedControlItem>
        </SegmentedControl>
        {#if length}
          {@const bounds = PAGE_WIDTH_BOUNDS[key][length.unit]}
          <div class="custom">
            <NumberField
              size="sm"
              width="full"
              value={length.value}
              min={bounds.min}
              max={bounds.max}
              step={length.unit === 'rem' ? 0.5 : 1}
              ariaLabel={m.editor_page_width_value({ label })}
              onValueChange={(v) => set(key, v == null ? null : formatLength(v, length.unit))}
            />
            <Select
              size="sm"
              items={UNIT_ITEMS}
              value={length.unit}
              onValueChange={(u) => set(key, convertPageWidth(key, length, u as LengthUnit))}
              ariaLabel={m.editor_page_width_unit({ label })}
            />
          </div>
        {/if}
      </div>
    </FieldRow>
  {/each}
  <Dialog
    open={pending != null}
    onOpenChange={(o) => { onOverlayOpenChange?.(o); if (!o) pending = null; }}
    size="sm"
    title={pending?.wrap ? m.editor_page_layout_to_columns_title() : m.editor_page_layout_to_flow_title()}
    description={pending?.wrap ? m.editor_page_layout_to_columns_desc() : m.editor_page_layout_to_flow_desc()}
  >
    {#snippet footer()}
      <Button variant="secondary" onclick={() => (pending = null)}>{m.editor_page_layout_cancel()}</Button>
      <Button variant="primary" onclick={confirmPending}>{m.editor_page_layout_confirm()}</Button>
    {/snippet}
  </Dialog>
  {#if modified}
    <div class="reset"><Button size="sm" variant="ghost" onclick={() => onChange(setPageWidth(setPageWidth(value, 'read', null), 'wide', null))}>{m.editor_block_settings_reset_auto()}</Button></div>
  {/if}
</BlockSettingsSection>

<style>
  .layout { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .width { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .custom { display: flex; gap: var(--ds-space-sm); align-items: center; }
  .reset { display: flex; justify-content: flex-end; }
</style>
