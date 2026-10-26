<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The class hierarchy (docs/architecture/semantic-layer.md), depth-first from the server
  // and indented by depth, so no parent column. The root and the node types
  // are core schema: never deleted, their key and parent locked, the root not
  // editable at all. A class accumulates every group up its chain.
  import { enhance } from '$app/forms';
  import { Button, Table, TableRow, TableCell, type TableColumn, EmptyState } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import CatalogFilterBar from '$lib/features/semantic/routes/CatalogFilterBar.svelte';
  import CatalogLabel from '$lib/features/semantic/routes/CatalogLabel.svelte';
  import { rowMatches, rowMissingLocales } from '$lib/features/semantic/routes/catalogFilter';
  import { localize } from '$lib/platform/i18n/localizedText';
  import NodeClassModal from '$lib/features/semantic/routes/NodeClassModal.svelte';
  import { inheritedGroups } from '$lib/features/semantic';
  import * as m from '$lib/paraglide/messages';
  let { data, form } = $props();

  type Row = (typeof data.classes)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; row: Row };
  let modal = $state<ModalState | null>(null);

  const groupLabel = (slug: string | null) => (slug ? localize(data.groups.find((g) => g.slug === slug)?.label, slug) : '');

  let query = $state('');
  let missingOnly = $state(false);
  const rows = $derived(
    data.classes.map((row) => {
      const texts = [{ text: row.label }, { text: row.description, optional: true }];
      return { row, missing: rowMissingLocales(texts), matches: rowMatches(query, [row.slug], texts) };
    })
  );
  const missingCount = $derived(rows.filter((r) => r.missing.length > 0).length);
  const visible = $derived(rows.filter((r) => r.matches && (!missingOnly || r.missing.length > 0)));
  const kindLabel = (kind: Row['kind']) =>
    kind === 'root' ? m.settings_schema_classes_kind_root() : kind === 'type' ? m.settings_schema_classes_kind_type() : m.settings_schema_classes_kind_domain();

  const columns = $derived<TableColumn[]>([
    { label: m.settings_schema_classes_col_slug(), width: '13rem' },
    { label: m.settings_schema_classes_col_label(), width: '14rem' },
    { label: m.settings_schema_classes_col_kind(), width: '6.5rem' },
    { label: m.settings_schema_classes_col_fields() },
    { label: m.settings_schema_classes_col_overview(), width: '10rem' },
    { label: m.settings_schema_classes_col_nodes(), width: '4.5rem', align: 'end' },
    { label: m.settings_schema_properties_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_schema_classes_title()} intro={m.settings_schema_classes_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_schema_classes_add()}</Button>
</SettingsPageHead>

{#if data.classes.length > 0}
  <CatalogFilterBar bind:query bind:missingOnly {missingCount} />
  {#if visible.length > 0}
  <Table {columns} minWidth="64rem" ariaLabel={m.settings_schema_classes_title()}>
    {#each visible as { row, missing } (row.id)}
      {@const inherited = inheritedGroups(data.classes, row.parent_id)}
      <TableRow tone={row.kind === 'domain' ? 'default' : 'muted'} data-id={row.id}>
        <!-- Node types sit flush left (depth 1); each further level steps in. -->
        <TableCell mono indent={Math.max(0, row.depth - 1)}>{row.slug}</TableCell>
        <TableCell><CatalogLabel label={localize(row.label, row.slug)} title={localize(row.description, '') || undefined} {missing} /></TableCell>
        <TableCell muted nowrap>{kindLabel(row.kind)}</TableCell>
        <TableCell truncate title={[row.property_group ? groupLabel(row.property_group) : '', ...inherited.map((g) => groupLabel(g))].filter(Boolean).join(', ') || undefined}>
          {#if row.property_group}<code class="group">{row.property_group}</code> {groupLabel(row.property_group) !== row.property_group ? groupLabel(row.property_group) : ''}{/if}
          {#if inherited.length > 0}
            <span class="inherited">{m.settings_schema_classes_fields_inherited_count({ count: inherited.length })}</span>
          {/if}
        </TableCell>
        <TableCell truncate title={row.overview_title ?? undefined}>{#if row.overview_path}<a href={row.overview_path}>{row.overview_title}</a>{/if}</TableCell>
        <TableCell align="end"><span class="count">{row.node_count}</span></TableCell>
        <TableCell actions>
          {#if row.kind !== 'root'}
            <Button type="button" variant="ghost" size="sm" icon title={m.settings_schema_classes_edit()} aria-label={m.settings_schema_classes_edit()} onclick={() => (modal = { mode: 'edit', row })}><Icon name="pencil" size={14} /></Button>
          {/if}
          {#if row.kind === 'domain'}
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" variant="ghost-danger" size="sm" icon disabled={row.node_count > 0} title={row.node_count > 0 ? m.settings_schema_classes_delete_in_use_title() : m.settings_schema_classes_delete()} aria-label={m.settings_schema_classes_delete()}><Icon name="trash" size={14} /></Button>
            </form>
          {/if}
        </TableCell>
      </TableRow>
    {/each}
  </Table>
  {:else}
    <EmptyState>{m.settings_catalog_filter_no_results()}</EmptyState>
  {/if}
{:else}
  <EmptyState>{m.settings_schema_classes_empty()}</EmptyState>
{/if}

{#if modal}
  <NodeClassModal
    open={true}
    onOpenChange={(v) => {
      if (!v) modal = null;
    }}
    mode={modal.mode}
    row={modal.mode === 'edit' ? modal.row : null}
    classes={data.classes}
    groups={data.groups}
    error={form?.error?.message ?? null}
    onSaved={() => (modal = null)}
  />
{/if}

<style>
  .group {
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-sm);
    background: color-mix(in srgb, var(--ds-color-border) 45%, transparent);
    border-radius: var(--ds-radius-sm);
    padding: 0.1em 0.4em;
  }
  .inherited { margin-left: 0.3rem; font-size: var(--ds-text-xs); color: var(--ds-color-muted); white-space: nowrap; }
  .count { font-variant-numeric: tabular-nums; }
</style>
