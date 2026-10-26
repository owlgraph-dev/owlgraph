<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A page layout is structure only, never a look (docs/architecture/blocks/layout.md, "Page
  // layout: sections"). Initial values are a one-time snapshot: the page remounts this per
  // open. Template, gap and section defaults post as JSON beside the named
  // fields; Standard is the flow, so only its name and description show.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Select, Switch, Alert, FormField } from '$lib/design-system';
  import { TIERS, GAP_STEPS, type ColumnGap, type ColumnTemplate, type Tier, type SectionDefaults, type SpaceToken } from '$lib/features/content';
  import { type PageLayoutPreset } from '$lib/features/pages';
  import { ColumnTemplateField, PageLayoutThumbnail } from '$lib/features/pages/components';
  import { LocalizedField } from '$lib/features/semantic/components';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    mode,
    preset,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    preset: PageLayoutPreset | null;
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'page-layout-form';
  // Select has no empty item: Auto and the reading column map back to nothing stored.
  const AUTO = '__auto__';
  // A new layout starts as two equal columns, stacked on a phone, spanning the wide band.
  const START: ColumnTemplate = { desktop: [1, 1], tablet: [1, 1], phone: [1] };

  const flow = untrack(() => preset?.mode === 'flow');
  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...preset?.label })));
  let description = $state<Record<string, string | undefined>>(untrack(() => ({ ...preset?.description })));
  let template = $state<ColumnTemplate>(untrack(() => preset?.template ?? START));
  let gap = $state<ColumnGap>(untrack(() => ({ ...(preset?.gap ?? {}) })));
  let sectionDefaults = $state<SectionDefaults>(untrack(() => (preset ? { ...preset.sectionDefaults } : { width: 'wide' })));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_page_layouts_new_title() : m.settings_page_layouts_edit_title());
  const TIER_LABEL: Record<Tier, () => string> = {
    desktop: m.settings_page_layouts_tier_desktop,
    tablet: m.settings_page_layouts_tier_tablet,
    phone: m.settings_page_layouts_tier_phone,
  };
  const GAP_LABEL: Record<SpaceToken, () => string> = {
    none: m.capability_spacing_preset_none,
    sm: m.capability_spacing_preset_sm,
    md: m.capability_spacing_preset_md,
    lg: m.capability_spacing_preset_lg,
  };
  const gapItems = [{ value: AUTO, label: m.capability_common_auto() }, ...GAP_STEPS.map((step) => ({ value: step, label: GAP_LABEL[step]() }))];
  const spanItems = [
    { value: AUTO, label: m.section_width_normal() },
    { value: 'wide', label: m.section_width_wide() },
    { value: 'full', label: m.section_width_full() },
  ];

  function setGap(tier: Tier, v: string) {
    const next = { ...gap };
    if (v === AUTO) delete next[tier];
    else next[tier] = v as SpaceToken;
    gap = next;
  }

  function setSpan(v: string) {
    const next = { ...sectionDefaults };
    if (v === 'wide' || v === 'full') next.width = v;
    else delete next.width;
    sectionDefaults = next;
  }

  function setBleed(on: boolean) {
    const next = { ...sectionDefaults };
    if (on) next.bleedToTop = true;
    else delete next.bleedToTop;
    sectionDefaults = next;
  }
</script>

<Dialog {open} {onOpenChange} size="md" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? '?/createPreset' : '?/updatePreset'}
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if mode === 'edit' && preset}<input type="hidden" name="id" value={preset.id} />{/if}

    <LocalizedField label={m.settings_page_layouts_label_label()} name="label" required bind:value={label} placeholder={m.settings_page_layouts_label_placeholder()} autofocus />
    <LocalizedField label={m.settings_page_layouts_description_label()} name="description" multiline bind:value={description} hint={m.settings_page_layouts_description_hint()} />

    {#if flow}
      <p class="note">{m.settings_page_layouts_flow_note()}</p>
    {:else}
      <input type="hidden" name="template" value={JSON.stringify(template)} />
      <input type="hidden" name="gap" value={JSON.stringify(gap)} />
      <input type="hidden" name="sectionDefaults" value={JSON.stringify(sectionDefaults)} />

      <div class="preview"><PageLayoutThumbnail {template} label={m.settings_page_layouts_preview()} /></div>

      {#each TIERS as tier (tier)}
        <fieldset class="tier">
          <legend>{TIER_LABEL[tier]()}</legend>
          <ColumnTemplateField {template} {tier} tierLabel={TIER_LABEL[tier]()} onChange={(next) => (template = next)} />
          <FormField label={m.editor_page_columns_gap()}>
            <Select size="sm" items={gapItems} value={gap[tier] ?? AUTO} onValueChange={(v) => setGap(tier, v)} />
          </FormField>
        </fieldset>
      {/each}

      <fieldset class="tier">
        <legend>{m.settings_page_layouts_sections_label()}</legend>
        <FormField label={m.settings_page_layouts_span_label()} hint={m.settings_page_layouts_span_hint()}>
          <Select size="sm" items={spanItems} value={sectionDefaults.width ?? AUTO} onValueChange={setSpan} />
        </FormField>
        <Switch checked={!!sectionDefaults.bleedToTop} onCheckedChange={setBleed} size="sm">{m.settings_page_layouts_bleed_label()}</Switch>
      </fieldset>
    {/if}

    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!label[siteDefaultLocale()]?.trim()}>{m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .note { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .preview { display: flex; }
  .tier {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    margin: 0;
    padding: var(--ds-space-sm) 0 0;
    border: none;
    border-top: 1px solid var(--ds-color-border);
  }
  .tier legend { padding: 0; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); }
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
