<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Labels are LocalizedText (docs/architecture/languages.md): shown resolved, searched in every
  // language, with the missing-translation indicator the filter narrows to.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn, EmptyState } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import CatalogFilterBar from '$lib/features/semantic/routes/CatalogFilterBar.svelte';
  import CatalogLabel from '$lib/features/semantic/routes/CatalogLabel.svelte';
  import { rowMatches, rowMissingLocales } from '$lib/features/semantic/routes/catalogFilter';
  import { localize } from '$lib/platform/i18n/localizedText';
  import PropertyGroupModal from '$lib/features/semantic/routes/PropertyGroupModal.svelte';
  import * as m from '$lib/paraglide/messages';
  let { data, form } = $props();

  type Row = (typeof data.groups)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; row: Row };
  let modal = $state<ModalState | null>(null);

  let query = $state('');
  let missingOnly = $state(false);
  const rows = $derived(
    data.groups.map((row) => {
      const texts = [{ text: row.label }, { text: row.description, optional: true }];
      return { row, missing: rowMissingLocales(texts), matches: rowMatches(query, [row.slug], texts) };
    })
  );
  const missingCount = $derived(rows.filter((r) => r.missing.length > 0).length);
  const visible = $derived(rows.filter((r) => r.matches && (!missingOnly || r.missing.length > 0)));

  const columns = $derived<TableColumn[]>([
    { label: m.settings_schema_groups_col_slug(), width: '12rem' },
    { label: m.settings_schema_groups_col_label(), width: '16rem' },
    { label: m.settings_schema_groups_col_description() },
    { label: m.settings_schema_properties_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_schema_groups_title()} intro={m.settings_schema_groups_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_schema_groups_add()}</Button>
</SettingsPageHead>

{#if data.groups.length > 0}
  <CatalogFilterBar bind:query bind:missingOnly {missingCount} />
  {#if visible.length > 0}
    <Table {columns} minWidth="44rem" ariaLabel={m.settings_schema_groups_title()}>
      {#each visible as { row, missing } (row.slug)}
        {@const description = localize(row.description, '')}
        <TableRow>
          <TableCell mono>{row.slug}</TableCell>
          <TableCell><CatalogLabel label={localize(row.label, row.slug)} {missing} /></TableCell>
          <TableCell muted truncate title={description}>{description}</TableCell>
          <TableCell actions>
            <Button type="button" variant="ghost" size="sm" icon title={m.settings_schema_groups_edit()} aria-label={m.settings_schema_groups_edit()} onclick={() => (modal = { mode: 'edit', row })}><Icon name="pencil" size={14} /></Button>
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="slug" value={row.slug} />
              <Button type="submit" variant="ghost-danger" size="sm" icon title={m.settings_schema_groups_delete()} aria-label={m.settings_schema_groups_delete()}><Icon name="trash" size={14} /></Button>
            </form>
          </TableCell>
        </TableRow>
      {/each}
    </Table>
  {:else}
    <EmptyState>{m.settings_catalog_filter_no_results()}</EmptyState>
  {/if}
{:else}
  <EmptyState>{m.settings_schema_groups_empty()}</EmptyState>
{/if}

{#if modal}
  <PropertyGroupModal
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
