<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The default namespace has no prefix and cannot be deleted.
  import { enhance } from '$app/forms';
  import { Button, Dialog, Table, TableRow, TableCell, type TableColumn } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { NamespaceModal } from '$lib/features/namespaces/components';
  import { NamespaceMembersModal } from '$lib/features/namespaces/components';
  import * as m from '$lib/paraglide/messages';
  let { data, form } = $props();

  type Row = (typeof data.namespaces)[number];
  type ModalState = { mode: 'create' } | { mode: 'edit'; row: Row };
  let modal = $state<ModalState | null>(null);
  let membersFor = $state<Row | null>(null);
  let deleteTarget = $state<Row | null>(null);
  const deleteFormId = 'namespace-delete-form';

  function accessShort(level: string): string {
    if (level === 'public') return m.settings_namespaces_access_short_public();
    if (level === 'internal') return m.settings_namespaces_access_short_internal();
    return m.settings_namespaces_access_short_restricted();
  }

  const columns = $derived<TableColumn[]>([
    { label: m.settings_namespaces_col_name(), width: '14rem' },
    { label: m.settings_namespaces_col_slug(), width: '11rem' },
    { label: m.settings_namespaces_col_access(), width: '10rem' },
    { label: m.settings_namespaces_col_count(), width: '6rem', align: 'end' },
    { label: m.settings_col_actions(), align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_namespaces_title()} intro={m.settings_namespaces_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (modal = { mode: 'create' })}>{m.settings_namespaces_add()}</Button>
</SettingsPageHead>

<Table {columns} minWidth="56rem" ariaLabel={m.settings_namespaces_title()}>
  {#each data.namespaces as ns (ns.id)}
    <TableRow data-id={ns.id}>
      <TableCell truncate title={ns.name}>{ns.name}{#if ns.is_default}<span class="default-badge">{m.settings_namespaces_default_badge()}</span>{/if}</TableCell>
      {#if ns.is_default}
        <TableCell muted nowrap><em>{m.settings_namespaces_default_slug_placeholder()}</em></TableCell>
      {:else}
        <TableCell mono title={`/${ns.slug}`}>/{ns.slug}</TableCell>
      {/if}
      <TableCell nowrap>{accessShort(ns.access_level)}</TableCell>
      <TableCell align="end"><span class="count">{ns.node_count}</span></TableCell>
      <TableCell actions>
        {#if ns.access_level === 'restricted'}
          <Button type="button" variant="ghost" size="sm" onclick={() => (membersFor = ns)}>
            {m.settings_namespaces_members_action()} ({(data.membersByNamespace[ns.id] ?? []).length})
          </Button>
        {/if}
        <Button type="button" variant="ghost" size="sm" icon title={m.settings_namespaces_edit()} aria-label={m.settings_namespaces_edit()} onclick={() => (modal = { mode: 'edit', row: ns })}><Icon name="pencil" size={14} /></Button>
        {#if !ns.is_default}
          <Button type="button" variant="ghost-danger" size="sm" icon title={m.settings_namespaces_delete()} aria-label={m.settings_namespaces_delete()} onclick={() => (deleteTarget = ns)}><Icon name="trash" size={14} /></Button>
        {/if}
      </TableCell>
    </TableRow>
  {/each}
</Table>

{#if modal}
  <NamespaceModal
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

{#if membersFor}
  <NamespaceMembersModal
    open={true}
    onOpenChange={(v) => {
      if (!v) membersFor = null;
    }}
    namespace={membersFor}
    users={data.users}
    members={data.membersByNamespace[membersFor.id] ?? []}
    onSaved={() => (membersFor = null)}
  />
{/if}

<!-- Deletion moves content to the default namespace and breaks old URLs. -->
<Dialog
  open={deleteTarget !== null}
  onOpenChange={(o) => { if (!o) deleteTarget = null; }}
  size="sm"
  variant="danger"
  title={m.settings_namespaces_delete_confirm_title()}
  description={m.settings_namespaces_delete_confirm_body()}
>
  <form id={deleteFormId} method="POST" action="?/delete" use:enhance={() => async ({ update }) => { await update(); deleteTarget = null; }}>
    <input type="hidden" name="id" value={deleteTarget?.id ?? ''} />
  </form>
  {#snippet footer()}
    <Button type="button" onclick={() => (deleteTarget = null)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={deleteFormId} variant="danger">{m.settings_namespaces_delete()}</Button>
  {/snippet}
</Dialog>

<style>
  .default-badge {
    margin-left: 0.4rem;
    font-size: var(--ds-text-xs);
    color: var(--ds-color-accent);
    background: var(--ds-color-accent-soft);
    border-radius: var(--ds-radius-pill);
    padding: 0.05rem 0.45rem;
  }
  .count { font-variant-numeric: tabular-nums; }
</style>
