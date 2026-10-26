<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A core class keeps its key and parent (docs/architecture/semantic-layer.md). Select has
  // no native `name` and reads an empty value as unset, so the optional group's
  // "none" is a sentinel the hidden input maps back to ''.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Select, Alert, FormField } from '$lib/design-system';
  import LocalizedField from '../components/LocalizedField.svelte';
  import { PagePicker } from '$lib/features/search/picker';
  import * as m from '$lib/paraglide/messages';
  import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
  import { inheritedGroups, subtreeOf, type NodeClassTreeRow } from '../nodeClassTree';
  import { labelWithKey } from '../localizeSchema';

  type ClassRow = NodeClassTreeRow & {
    slug: string;
    label: LocalizedText;
    description: LocalizedText;
    kind: 'root' | 'type' | 'domain';
    depth: number;
    overview_node_id: string | null;
    overview_title: string | null;
  };

  let {
    open,
    onOpenChange,
    mode,
    row,
    classes,
    groups,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    row: ClassRow | null;
    classes: ClassRow[];
    groups: { slug: string; label: LocalizedText }[];
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'node-class-form';
  const NONE = '__none__';
  const isCore = $derived(mode === 'edit' && !!row && row.kind !== 'domain');

  let slug = $state(untrack(() => row?.slug ?? ''));
  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.label })));
  let description = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.description })));
  // A core row's parent is the root, which the picker never offers: leave it empty.
  let parent = $state(untrack(() => (row && row.kind !== 'domain' ? '' : (row?.parent_id ?? ''))));
  let group = $state(untrack(() => row?.property_group ?? NONE));
  let overviewId = $state(untrack(() => row?.overview_node_id ?? ''));
  let overviewTitle = $state(untrack(() => row?.overview_title ?? ''));
  // Opens only on demand: listing pages even for an empty query, it would make
  // the modal taller than a viewport.
  let pickingOverview = $state(false);
  let submitted = $state(false);

  const excluded = $derived(row ? subtreeOf(classes, row.id) : new Set<string>());
  const parentItems = $derived(
    classes
      .filter((c) => c.kind !== 'root' && !excluded.has(c.id))
      .map((c) => ({ value: c.id, label: `${'– '.repeat(Math.max(0, c.depth - 1))}${labelWithKey(localize(c.label, c.slug), c.slug)}` }))
  );
  const groupItems = $derived([
    { value: NONE, label: m.settings_schema_classes_group_none() },
    ...groups.map((g) => ({ value: g.slug, label: labelWithKey(localize(g.label, g.slug), g.slug) })),
  ]);
  const groupLabel = (slug: string) => localize(groups.find((g) => g.slug === slug)?.label, slug);
  const formInherited = $derived(inheritedGroups(classes, parent || null));
  const parentHint = $derived(
    formInherited.length > 0
      ? `${m.settings_schema_classes_parent_hint()} ${m.settings_schema_classes_inherited_hint({ groups: formInherited.map((g) => groupLabel(g)).join(', ') })}`
      : m.settings_schema_classes_parent_hint()
  );

  const title = $derived(mode === 'create' ? m.settings_schema_classes_add_heading() : m.settings_schema_classes_update_heading());
  const canSave = $derived(!!slug.trim() && !!label[siteDefaultLocale()]?.trim() && (isCore || !!parent));
</script>

<Dialog {open} {onOpenChange} size="lg" {title}>
  <form
    id={formId}
    method="POST"
    action="?/save"
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if isCore}<p class="core-hint">{m.settings_schema_classes_core_locked()}</p>{/if}
    <input type="hidden" name="id" value={row?.id ?? ''} />
    <input type="hidden" name="parentId" value={parent} />
    <input type="hidden" name="propertyGroup" value={group === NONE ? '' : group} />
    <input type="hidden" name="overviewNodeId" value={overviewId} />
    <div class="field-grid">
      <FormField label={m.settings_schema_classes_slug_field()}><Input name="slug" bind:value={slug} placeholder={m.settings_schema_classes_slug_placeholder()} required readonly={isCore} autofocus={!isCore} /></FormField>
      <div class="wide"><LocalizedField label={m.settings_schema_classes_label_field()} name="label" required bind:value={label} placeholder={m.settings_schema_classes_label_placeholder()} autofocus={isCore} /></div>
      <div class="wide">
        <FormField label={m.settings_schema_classes_parent_field()} hint={parentHint}>
          <Select items={parentItems} bind:value={parent} placeholder={m.settings_schema_classes_parent_none()} disabled={isCore} width="full" />
        </FormField>
      </div>
      <div class="wide">
        <FormField label={m.settings_schema_classes_group_field()} optionalLabel={m.form_field_optional()} hint={m.settings_schema_classes_group_hint()}>
          <Select items={groupItems} bind:value={group} width="full" />
        </FormField>
      </div>
      <div class="wide"><LocalizedField label={m.settings_schema_classes_description_field()} name="description" multiline bind:value={description} placeholder={m.settings_schema_classes_description_placeholder()} /></div>
      <div class="wide">
      <FormField label={m.settings_schema_classes_overview_field()} optionalLabel={m.form_field_optional()} hint={m.settings_schema_classes_overview_hint()} group>
        <p class="overview-current">
          {#if overviewId}
            <strong>{overviewTitle}</strong>
            <Button type="button" variant="ghost" size="sm" onclick={() => { overviewId = ''; overviewTitle = ''; }}>{m.settings_schema_classes_overview_clear()}</Button>
          {:else if pickingOverview}
            <Button type="button" variant="ghost" size="sm" onclick={() => (pickingOverview = false)}>{m.settings_schema_properties_cancel()}</Button>
          {:else}
            <span class="muted">{m.settings_schema_classes_overview_none()}</span>
            <Button type="button" variant="ghost" size="sm" onclick={() => (pickingOverview = true)}>{m.settings_schema_classes_overview_pick()}</Button>
          {/if}
        </p>
        {#if pickingOverview && !overviewId}
          <div class="overview-picker">
            <PagePicker onselect={(p) => { overviewId = p.id; overviewTitle = p.title; pickingOverview = false; }} />
          </div>
        {/if}
      </FormField>
      </div>
    </div>
    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_schema_properties_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{m.settings_schema_classes_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm) var(--ds-space-md); }
  .wide { grid-column: 1 / -1; }
  .core-hint { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .overview-current { margin: 0; display: flex; align-items: center; gap: var(--ds-space-sm); font-size: var(--ds-text-md); color: var(--ds-color-fg); }
  .muted { color: var(--ds-color-muted); }
  .overview-picker { max-height: 12rem; overflow-y: auto; }
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
