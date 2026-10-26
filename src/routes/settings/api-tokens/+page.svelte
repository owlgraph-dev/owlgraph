<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A new token is shown once.
  import { enhance } from '$app/forms';
  import { formatDate, formatDateTime } from '$lib/platform/i18n/format';
  import { Button, Table, TableRow, TableCell, SettingsWell, type TableColumn, EmptyState } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { ApiTokenModal } from '$lib/features/auth/components';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();
  let adding = $state(false);

  const intro = $derived(`${m.settings_api_tokens_intro_lead()} ${data.role}${m.settings_api_tokens_intro_bearer()} Authorization: Bearer <token>.`);
  const columns = $derived<TableColumn[]>([
    { label: m.settings_api_tokens_col_name() },
    { label: m.settings_api_tokens_col_prefix(), width: '8rem' },
    { label: m.settings_api_tokens_col_created(), width: '9rem' },
    { label: m.settings_api_tokens_col_expires(), width: '9rem' },
    { label: m.settings_api_tokens_col_last_used(), width: '11rem' },
    { label: m.settings_api_tokens_revoke(), width: '8rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_api_tokens_title()} {intro} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (adding = true)}>{m.settings_api_tokens_add()}</Button>
</SettingsPageHead>

{#if form?.created}
  <div class="new-token">
    <SettingsWell>
      <div class="new-token-body">
        <p class="label">{m.settings_api_tokens_new_token_lead()} <strong>{form.created.name}</strong> {m.settings_api_tokens_new_token_trail()}</p>
        <code class="token">{form.created.token}</code>
      </div>
    </SettingsWell>
  </div>
{/if}

{#if data.tokens.length > 0}
  <Table {columns} minWidth="52rem" ariaLabel={m.settings_api_tokens_title()}>
    {#each data.tokens as t (t.id)}
      <TableRow data-id={t.id}>
        <TableCell truncate title={t.name}>{t.name}</TableCell>
        <TableCell mono>{t.prefix}…</TableCell>
        <TableCell muted nowrap>{formatDate(t.created_at)}</TableCell>
        <TableCell muted nowrap>{t.expires_at ? formatDate(t.expires_at) : '—'}</TableCell>
        <TableCell muted nowrap>{t.last_used_at ? formatDateTime(t.last_used_at) : '—'}</TableCell>
        <TableCell actions>
          <form method="POST" action="?/revoke" use:enhance>
            <input type="hidden" name="id" value={t.id} />
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_api_tokens_revoke()}</Button>
          </form>
        </TableCell>
      </TableRow>
    {/each}
  </Table>
{:else}
  <EmptyState>{m.settings_api_tokens_empty()}</EmptyState>
{/if}

{#if adding}
  <ApiTokenModal
    open={true}
    onOpenChange={(v) => {
      if (!v) adding = false;
    }}
    onSaved={() => (adding = false)}
  />
{/if}

<style>
  .new-token { margin: 0 0 var(--ds-space-md); }
  .new-token-body { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .label { margin: 0; font-size: var(--ds-text-sm); }
  .token {
    display: block;
    word-break: break-all;
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    padding: 0.5rem 0.7rem;
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-sm);
  }
</style>
