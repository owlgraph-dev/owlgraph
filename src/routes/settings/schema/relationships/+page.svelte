<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Labels are LocalizedText (docs/architecture/languages.md): shown resolved, searched in every
  // language, with the missing-translation indicator the filter narrows to.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, Combobox, Dialog, type TableColumn, EmptyState, Chip } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import CatalogFilterBar from '$lib/features/semantic/routes/CatalogFilterBar.svelte';
  import CatalogLabel from '$lib/features/semantic/routes/CatalogLabel.svelte';
  import { rowMatches, rowMissingLocales } from '$lib/features/semantic/routes/catalogFilter';
  import { localize, hasText } from '$lib/platform/i18n/localizedText';
  import RelationshipTypeModal from '$lib/features/semantic/routes/RelationshipTypeModal.svelte';
  import * as m from '$lib/paraglide/messages';
  let { data, form } = $props();

  type Row = (typeof data.relationshipTypes)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; row: Row };
  let modal = $state<ModalState | null>(null);

  let query = $state('');
  let missingOnly = $state(false);
  const rows = $derived(
    data.relationshipTypes.map((row) => {
      const texts = [{ text: row.label }, { text: row.inverse_label, optional: true }, { text: row.description, optional: true }];
      return { row, missing: rowMissingLocales(texts), matches: rowMatches(query, [row.slug], texts) };
    })
  );
  const missingCount = $derived(rows.filter((r) => r.missing.length > 0).length);
  const visible = $derived(rows.filter((r) => r.matches && (!missingOnly || r.missing.length > 0)));

  const columns = $derived<TableColumn[]>([
    { label: m.settings_schema_relationships_col_slug(), width: '10rem' },
    { label: m.settings_schema_relationships_col_label(), width: '14rem' },
    { label: m.settings_schema_relationships_col_inverse_label(), width: '10rem' },
    { label: m.settings_schema_relationships_col_properties() },
    { label: m.settings_schema_relationships_col_description() },
    { label: m.settings_schema_properties_col_actions(), width: '18rem', align: 'end', hideLabel: true },
  ]);

  // One dialog for every row: propsModalSlug opens it and names the type the
  // selection belongs to. Search-to-add, so it scales with the catalog.
  const propsFormId = 'relationship-properties-form';
  let propsModalSlug = $state<string | null>(null);
  let selectedNames = $state<string[]>([]);
  let propertyDraft = $state('');

  function openPropsModal(slug: string) {
    propsModalSlug = slug;
    selectedNames = (data.typeProperties[slug] ?? []).map((p) => p.name);
  }
  function closePropsModal() {
    propsModalSlug = null;
  }
  const labelOf = (name: string) => localize(data.propertyDefinitions.find((d) => d.name === name)?.label, name);
  const propertyOptions = $derived(
    data.propertyDefinitions.filter((d) => !selectedNames.includes(d.name)).map((d) => d.name)
  );
  // Combobox commits any typed text; only an existing property is taken.
  function addProperty(v: string | null) {
    const name = (v ?? '').trim();
    propertyDraft = '';
    if (!name || selectedNames.includes(name)) return;
    if (!data.propertyDefinitions.some((d) => d.name === name)) return;
    selectedNames = [...selectedNames, name];
  }
  function removeProperty(name: string) {
    selectedNames = selectedNames.filter((n) => n !== name);
  }
  function propertyLabel(row: { slug: string }): string {
    const props = data.typeProperties[row.slug] ?? [];
    return props.length ? props.map((p) => localize(p.label, p.name)).join(', ') : '—';
  }
</script>

<SettingsPageHead title={m.settings_schema_relationships_title()} intro={m.settings_schema_relationships_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_schema_relationships_add()}</Button>
</SettingsPageHead>

{#if data.relationshipTypes.length > 0}
  <CatalogFilterBar bind:query bind:missingOnly {missingCount} />
  {#if visible.length > 0}
  <Table {columns} minWidth="66rem" ariaLabel={m.settings_schema_relationships_title()}>
    {#each visible as { row, missing } (row.slug)}
      {@const inverseLabel = hasText(row.inverse_label) ? localize(row.inverse_label, '') : ''}
      {@const description = localize(row.description, '')}
      <TableRow>
        <TableCell mono>{row.slug}</TableCell>
        <TableCell><CatalogLabel label={localize(row.label, row.slug)} {missing} /></TableCell>
        <TableCell truncate title={inverseLabel}>{inverseLabel}</TableCell>
        <TableCell muted truncate title={propertyLabel(row)}>{propertyLabel(row)}</TableCell>
        <TableCell muted truncate title={description}>{description}</TableCell>
        <TableCell actions>
          <Button type="button" variant="ghost" size="sm" onclick={() => openPropsModal(row.slug)}>{m.settings_schema_relationships_manage_properties()}</Button>
          <Button type="button" variant="ghost" size="sm" icon title={m.settings_schema_relationships_edit()} aria-label={m.settings_schema_relationships_edit()} onclick={() => (modal = { mode: 'edit', row })}><Icon name="pencil" size={14} /></Button>
          <form method="POST" action="?/delete" use:enhance>
            <input type="hidden" name="slug" value={row.slug} />
            <Button type="submit" variant="ghost-danger" size="sm" icon title={m.settings_schema_relationships_delete()} aria-label={m.settings_schema_relationships_delete()}><Icon name="trash" size={14} /></Button>
          </form>
        </TableCell>
      </TableRow>
    {/each}
  </Table>
  {:else}
    <EmptyState>{m.settings_catalog_filter_no_results()}</EmptyState>
  {/if}
{:else}
  <EmptyState>{m.settings_schema_relationships_empty()}</EmptyState>
{/if}

{#if modal}
  <RelationshipTypeModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    row={modal.mode === 'edit' ? modal.row : null}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<Dialog
  open={propsModalSlug !== null}
  onOpenChange={(o) => { if (!o) closePropsModal(); }}
  size="md"
  title={propsModalSlug ? m.settings_schema_relationships_properties_modal_title({ slug: propsModalSlug }) : ''}
>
  <p class="props-intro">{m.settings_schema_relationships_properties_intro()}</p>
  {#if data.propertyDefinitions.length > 0}
    <form
      id={propsFormId}
      method="POST"
      action="?/setProperties"
      use:enhance={() => async ({ update }) => { await update({ reset: false }); closePropsModal(); }}
    >
      <input type="hidden" name="slug" value={propsModalSlug} />
      {#each selectedNames as name (name)}
        <input type="hidden" name="propertyNames" value={name} />
      {/each}
      {#if selectedNames.length > 0}
        <div class="chips">
          {#each selectedNames as name (name)}
            <Chip label={labelOf(name) !== name ? `${name} — ${labelOf(name)}` : name} removeLabel={m.settings_schema_relationships_properties_remove()} onRemove={() => removeProperty(name)} />
          {/each}
        </div>
      {/if}
      <Combobox value={propertyDraft} options={propertyOptions} onValueChange={addProperty} placeholder={m.settings_schema_relationships_properties_search_placeholder()} --combo-width="100%" />
    </form>
  {:else}
    <EmptyState size="sm">{m.settings_schema_properties_empty()}</EmptyState>
  {/if}
  {#snippet footer()}
    <Button type="button" onclick={closePropsModal}>{m.settings_schema_relationships_properties_cancel()}</Button>
    <Button type="submit" form={propsFormId} variant="primary" disabled={data.propertyDefinitions.length === 0}>{m.settings_schema_relationships_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .props-intro { color: var(--ds-color-muted); font-size: var(--ds-text-sm); line-height: 1.5; margin: 0 0 var(--ds-space-sm); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: var(--ds-space-sm); max-height: 30vh; overflow-y: auto; }
</style>
