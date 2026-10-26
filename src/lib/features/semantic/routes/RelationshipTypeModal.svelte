<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The slug is the key, read-only when editing; a read-only input still
  // submits. An edge's properties are a separate action (?/setProperties).
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Alert, FormField } from '$lib/design-system';
  import LocalizedField from '../components/LocalizedField.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { LocalizedText } from '$lib/platform/i18n/localizedText';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';

  type Row = { slug: string; label: LocalizedText; description: LocalizedText; inverse_label: LocalizedText | null };

  let {
    open,
    onOpenChange,
    mode,
    row,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    row: Row | null;
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'relationship-type-form';
  let slug = $state(untrack(() => row?.slug ?? ''));
  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.label })));
  let inverseLabel = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.inverse_label })));
  let description = $state<Record<string, string | undefined>>(untrack(() => ({ ...row?.description })));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_schema_relationships_add_heading() : m.settings_schema_relationships_update_heading());
  const canSave = $derived(!!slug.trim() && !!label[siteDefaultLocale()]?.trim());
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
    <div class="field-grid">
      <FormField label={m.settings_schema_relationships_slug_field()}><Input name="slug" bind:value={slug} placeholder={m.settings_schema_relationships_slug_placeholder()} readonly={mode === 'edit'} required autofocus={mode === 'create'} /></FormField>
      <div class="wide"><LocalizedField label={m.settings_schema_relationships_label_field()} name="label" required bind:value={label} placeholder={m.settings_schema_relationships_label_placeholder()} autofocus={mode === 'edit'} /></div>
      <div class="wide"><LocalizedField label={m.settings_schema_relationships_inverse_label_field()} name="inverseLabel" bind:value={inverseLabel} placeholder={m.settings_schema_relationships_inverse_label_placeholder()} /></div>
      <div class="wide"><LocalizedField label={m.settings_schema_relationships_description_field()} name="description" multiline bind:value={description} placeholder={m.settings_schema_relationships_description_placeholder()} /></div>
    </div>
    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_schema_properties_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{m.settings_schema_relationships_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm) var(--ds-space-md); }
  .wide { grid-column: 1 / -1; }
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
