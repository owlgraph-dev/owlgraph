<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A person's connections (docs/architecture/settings.md, "The personal group"). Connect
  // opens the service's approval page in its own window and polls here, again
  // after a reload; the waiting row links to that page in case the window was
  // blocked or closed.
  import { invalidateAll } from '$app/navigation';
  import { Alert, Button, EmptyState, SettingsRow, Spinner } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { formatDate, formatDateTime } from '$lib/platform/i18n/format';
  import type { ServiceConnectionView } from '$lib/features/pluginHost';
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();

  type Busy = 'connect' | 'cancel' | 'check' | 'disconnect';
  type Note = { tone: 'success' | 'warning' | 'danger'; text: string };

  let busy = $state<Record<string, Busy | null>>({});
  let notes = $state<Record<string, Note | null>>({});

  async function request(method: 'POST' | 'DELETE', path: string): Promise<{ ok: boolean; body: Record<string, unknown> } | null> {
    try {
      const res = await fetch(path, method === 'POST' ? { method, headers: { 'content-type': 'application/json' }, body: '{}' } : { method });
      const body: unknown = await res.json().catch(() => null);
      return { ok: res.ok, body: body && typeof body === 'object' ? (body as Record<string, unknown>) : {} };
    } catch {
      return null;
    }
  }

  const api = (service: ServiceConnectionView, rest = '') => `/api/connections/${encodeURIComponent(service.id)}${rest}`;

  // A begin's refusal by its code (docs/architecture/routing.md, "Errors"), a poll's failure by its reason.
  function failure(reason: unknown, service: string): string {
    switch (reason) {
      case 'expired':
        return m.settings_connections_failed_expired();
      case 'disabled':
      case 'plugin_disabled':
        return m.settings_connections_failed_disabled({ service });
      case 'foreign-server':
        return m.settings_connections_failed_foreign_server({ service });
      case 'unauthorized':
        return m.settings_connections_failed_unauthorized({ service });
      case 'unreachable':
      case 'upstream_unreachable':
        return m.settings_connections_failed_unreachable({ service });
      case 'refused':
      case 'upstream_refused':
        return m.settings_connections_failed_refused({ service });
      case 'no-key':
      case 'secret_key_missing':
        return m.settings_connections_failed_no_key();
      default:
        return m.settings_connections_failed_generic();
    }
  }

  async function connect(service: ServiceConnectionView) {
    notes[service.id] = null;
    // Opened at once, inside the click: a window opened after a wait is one a
    // browser may block. It learns where to go once the connect has begun.
    const approval = window.open('', `connect-${service.id}`, 'popup,width=640,height=760');
    busy[service.id] = 'connect';
    const res = await request('POST', api(service));
    const approveUrl = res?.ok ? res.body.approveUrl : null;
    if (typeof approveUrl === 'string') {
      if (approval && !approval.closed) {
        // The service's page gets no way back into this one.
        approval.opener = null;
        approval.location.href = approveUrl;
      }
      await invalidateAll();
    } else {
      approval?.close();
      notes[service.id] = { tone: 'danger', text: failure((res?.body.error as { code?: unknown } | undefined)?.code, service.label) };
    }
    busy[service.id] = null;
  }

  async function cancel(service: ServiceConnectionView) {
    busy[service.id] = 'cancel';
    await request('DELETE', api(service, '/flow'));
    await invalidateAll();
    busy[service.id] = null;
  }

  async function check(service: ServiceConnectionView) {
    notes[service.id] = null;
    busy[service.id] = 'check';
    const res = await request('POST', api(service, '/check'));
    const status = res?.ok ? res.body.status : null;
    // 'renew' needs no note: the row says what changed once it is read again.
    if (status === 'active') notes[service.id] = { tone: 'success', text: m.settings_connections_check_active({ service: service.label }) };
    else if (status === 'unreachable' || status === 'disabled') notes[service.id] = { tone: 'danger', text: failure(status, service.label) };
    else if (!res?.ok) notes[service.id] = { tone: 'danger', text: failure(null, service.label) };
    await invalidateAll();
    busy[service.id] = null;
  }

  async function disconnect(service: ServiceConnectionView) {
    notes[service.id] = null;
    busy[service.id] = 'disconnect';
    const res = await request('DELETE', api(service));
    if (!res?.ok) notes[service.id] = { tone: 'danger', text: failure(null, service.label) };
    else if (res.body.removed === true && res.body.remoteRevoked !== true) {
      notes[service.id] = { tone: 'warning', text: m.settings_connections_remote_kept({ service: service.label, client: data.clientName }) };
    }
    await invalidateAll();
    busy[service.id] = null;
  }

  // One request at a time per row; the server asks the service at most every few seconds.
  const asking = new Set<string>();
  async function ask(service: ServiceConnectionView) {
    if (asking.has(service.id)) return;
    asking.add(service.id);
    try {
      const res = await request('POST', api(service, '/poll'));
      // No answer, or too many questions: the next tick asks again.
      if (!res?.ok || res.body.state === 'pending') return;
      if (res.body.state === 'failed') notes[service.id] = { tone: 'danger', text: failure(res.body.reason, service.label) };
      await invalidateAll();
    } finally {
      asking.delete(service.id);
    }
  }

  const waiting = $derived(data.services.filter((s) => s.approveUrl !== null));

  $effect(() => {
    const services = waiting;
    if (services.length === 0) return;
    const timer = setInterval(() => {
      for (const service of services) void ask(service);
    }, 2000);
    return () => clearInterval(timer);
  });

  const isBusy = (service: ServiceConnectionView) => (busy[service.id] ?? null) !== null;
</script>

<SettingsPageHead title={m.settings_connections_title()} intro={m.settings_connections_intro()}>
  {#if data.returnTo}
    <!-- Back to a reader page: a full navigation, under that page's own policy (platform/cspRoutes.ts). -->
    <Button href={data.returnTo} data-sveltekit-reload>{m.settings_connections_back()}</Button>
  {/if}
</SettingsPageHead>

{#if data.services.length === 0}
  <EmptyState>{m.settings_connections_empty()}</EmptyState>
{:else}
  <div class="rows">
    {#each data.services as service (service.id)}
      {@const connection = service.connection}
      {@const note = notes[service.id] ?? null}
      <SettingsRow label={service.label} description={service.intro}>
        <div class="control">
          {#if service.approveUrl}
            <p class="status" role="status">
              <Spinner size={14} />
              <span>{m.settings_connections_waiting({ service: service.label })}</span>
            </p>
            <div class="actions">
              <Button href={service.approveUrl} target="_blank" rel="noopener noreferrer">{m.settings_connections_open_approval({ service: service.label })}</Button>
              <Button variant="ghost" loading={busy[service.id] === 'cancel'} disabled={isBusy(service)} onclick={() => cancel(service)}>{m.settings_connections_cancel()}</Button>
            </div>
          {:else if connection}
            <div class="status-block" role="status">
              <p class="status"><strong>{m.settings_connections_connected_as({ account: connection.accountLabel })}</strong></p>
              <p class="meta">
                {m.settings_connections_since({ date: formatDate(connection.since) })}{#if connection.lastUsed}{' · '}{m.settings_connections_last_used({ date: formatDateTime(connection.lastUsed) })}{/if}
              </p>
            </div>
            {#if !service.available}
              <Alert tone="warning">{m.settings_connections_unavailable({ service: service.label })}</Alert>
            {:else if connection.state === 'revoked'}
              <Alert tone="warning">{m.settings_connections_revoked({ service: service.label })}</Alert>
            {:else if connection.state === 'moved'}
              <Alert tone="warning">{m.settings_connections_moved({ service: service.label })}</Alert>
            {/if}
            <div class="actions">
              {#if service.available && connection.state !== 'active'}
                <Button variant="primary" loading={busy[service.id] === 'connect'} disabled={isBusy(service)} onclick={() => connect(service)}>{m.settings_connections_reconnect()}</Button>
              {/if}
              {#if service.available && connection.state !== 'moved'}
                <Button loading={busy[service.id] === 'check'} disabled={isBusy(service)} onclick={() => check(service)}>{m.settings_connections_check()}</Button>
              {/if}
              <Button variant="ghost-danger" loading={busy[service.id] === 'disconnect'} disabled={isBusy(service)} onclick={() => disconnect(service)}>{m.settings_connections_disconnect()}</Button>
            </div>
          {:else if service.available}
            <p class="status" role="status">{m.settings_connections_not_connected()}</p>
            <div class="actions">
              <Button variant="primary" loading={busy[service.id] === 'connect'} disabled={isBusy(service)} onclick={() => connect(service)}>{m.settings_connections_connect({ service: service.label })}</Button>
            </div>
          {:else}
            <p class="status" role="status">{m.settings_connections_not_connected()}</p>
            <p class="meta">{m.settings_connections_unavailable({ service: service.label })}</p>
          {/if}
          {#if note}<Alert tone={note.tone}>{note.text}</Alert>{/if}
        </div>
      </SettingsRow>
    {/each}
  </div>
{/if}

<style>
  .rows { border-top: 1px solid var(--ds-color-border); }
  .control { display: flex; flex-direction: column; gap: var(--ds-space-sm); min-width: 0; }
  .status-block { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .status {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    margin: 0;
    color: var(--ds-color-fg);
    font-size: var(--ds-text-md);
    overflow-wrap: break-word;
  }
  .status strong { font-weight: var(--ds-weight-semibold); }
  .meta { margin: 0; color: var(--ds-color-muted); font-size: var(--ds-text-sm); overflow-wrap: break-word; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
</style>
