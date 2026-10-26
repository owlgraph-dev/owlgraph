<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Stays open on a failed save, or the error would land on the page behind the
  // user's back; `submitted` keeps a stale error off a fresh open. A collection's
  // own property (membership.ts) keeps its group, name and datatype.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Select, Alert, FormField } from '$lib/design-system';
  import LocalizedField from '../components/LocalizedField.svelte';
  import * as m from '$lib/paraglide/messages';
  import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
  import { PROPERTY_DATATYPES } from '../propertyDatatypes';
  import { MEMBERSHIP_PROPERTY_GROUP } from '../membership';

  type Row = { name: string; group_slug: string; label: LocalizedText; datatype: string; description: LocalizedText };

  let {
    open,
    onOpenChange,
    mode,
    row,
    groups,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    row: Row | null;
    groups: { slug: string; label: LocalizedText }[];
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'property-definition-form';
  const locked = untrack(() => mode === 'edit' && row?.group_slug === MEMBERSHIP_PROPERTY_GROUP);
  // A locked property's datatype may be one no form offers (a label's): shown as it is.
  const datatypeItems = untrack(() => [...new Set([...PROPERTY_DATATYPES, ...(locked && row ? [row.datatype] : [])])].map((t) => ({ value: t, label: t })));
  // No property is defined in a collection's own group: it is offered only to show one of its own.
  const groupItems = $derived(
    groups.filter((g) => locked || g.slug !== MEMBERSHIP_PROPERTY_GROUP).map((g) => ({ value: g.slug, label: localize(g.label, g.slug) }))
  );

  // The stored name is `group:local`; the action re-joins the halves, so a
  // changed group or name saves a new definition.
  let group = $state(untrack(() => row?.group_slug ?? groups.find((g) => g.slug !== MEMBERSHIP_PROPERTY_GROUP)?.slug ?? 'core'));
  let localName = $state(
    untrack(() =>
      row ? (row.name.startsWith(`${row.group_slug}:`) ? row.name.slice(row.group_slug.length + 1) : row.name) : ''
    )
  );
  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.label })));
  let datatype = $state(untrack(() => row?.datatype || 'text'));
  let description = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.description })));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_schema_properties_add_heading() : m.settings_schema_properties_update_heading());
  const canSave = $derived(!!localName.trim() && !!label[siteDefaultLocale()]?.trim());
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
    {#if locked}<div class="locked-note"><Alert tone="info">{m.settings_schema_properties_membership_locked()}</Alert></div>{/if}
    <div class="field-grid">
      <FormField label={m.settings_schema_properties_group_field()}>
        <Select items={groupItems} bind:value={group} width="full" disabled={locked} />
        <input type="hidden" name="groupSlug" value={group} />
      </FormField>
      <FormField label={m.settings_schema_properties_name_field()}><Input name="localName" bind:value={localName} placeholder={m.settings_schema_properties_name_placeholder()} required autofocus={!locked} readonly={locked} /></FormField>
      <FormField label={m.settings_schema_properties_datatype_field()}>
        <Select items={datatypeItems} bind:value={datatype} width="full" disabled={locked} />
        <input type="hidden" name="datatype" value={datatype} />
      </FormField>
      <div class="wide"><LocalizedField label={m.settings_schema_properties_label_field()} name="label" required bind:value={label} placeholder={m.settings_schema_properties_label_placeholder()} /></div>
      <div class="wide"><LocalizedField label={m.settings_schema_properties_description_field()} name="description" multiline bind:value={description} placeholder={m.settings_schema_properties_description_placeholder()} /></div>
    </div>
    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_schema_properties_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{m.settings_schema_properties_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm) var(--ds-space-md); }
  .wide { grid-column: 1 / -1; }
  .form-alert { margin-top: var(--ds-space-sm); }
  .locked-note { margin-bottom: var(--ds-space-sm); }
</style>
