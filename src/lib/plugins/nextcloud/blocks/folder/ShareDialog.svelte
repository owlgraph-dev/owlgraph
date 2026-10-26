<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // "New share …": connects a public share beside the page being edited. The
  // server keeps the token sealed; the dialog mounts fresh each time, so neither
  // the link nor the password is shown again.
  import { Alert, Button, Dialog, FormField, Input } from '$lib/design-system';
  import { t } from '../../messages';
  import { PLUGIN_ROUTES } from '../routes';

  let {
    open,
    pageId,
    onOpenChange,
    onConnected,
  }: {
    open: boolean;
    pageId: string | null;
    onOpenChange: (open: boolean) => void;
    onConnected: (collection: { id: string; title: string; href: string }) => void;
  } = $props();

  let shareUrl = $state('');
  let password = $state('');
  let missing = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function connect(event: SubmitEvent) {
    event.preventDefault();
    missing = shareUrl.trim() === '';
    if (missing || !pageId) return;
    busy = true;
    error = null;
    try {
      const res = await fetch(`${PLUGIN_ROUTES}/collections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ pageId, shareUrl: shareUrl.trim(), ...(password ? { password } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { collection?: { id: string; title: string; href: string }; error?: { code?: string; message?: string } };
      if (res.ok && body.collection) {
        onConnected(body.collection);
        onOpenChange(false);
      } else {
        error = typeof body.error?.message === 'string' ? body.error.message : t('connect_unreachable');
      }
    } catch {
      error = t('connect_unreachable');
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} {onOpenChange} size="sm" title={t('share_dialog_title')} description={t('share_dialog_desc')}>
  <form id="nc-folder-share-form" class="nc-folder-share-fields" onsubmit={connect} novalidate>
    <FormField label={t('connect_url_label')} hint={t('connect_url_desc')} error={missing ? t('share_dialog_required') : null}>
      <Input type="url" name="shareUrl" bind:value={shareUrl} required autocomplete="off" placeholder="https://" />
    </FormField>
    <FormField label={t('connect_password_label')} hint={t('connect_password_desc')} optionalLabel={t('share_dialog_optional')}>
      <Input type="password" name="password" bind:value={password} autocomplete="new-password" />
    </FormField>
  </form>
  {#if error}
    <Alert tone="danger">{error}</Alert>
  {/if}
  {#snippet footer()}
    <Button variant="secondary" onclick={() => onOpenChange(false)} disabled={busy}>{t('share_dialog_cancel')}</Button>
    <Button variant="primary" type="submit" form="nc-folder-share-form" loading={busy}>{t('share_dialog_connect')}</Button>
  {/snippet}
</Dialog>

<style>
  .nc-folder-share-fields { display: flex; flex-direction: column; gap: var(--ds-space-md); margin-bottom: var(--ds-space-md); }
</style>
