<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Dialog, Button, Alert } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    isHomePage,
    busy,
    error,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    isHomePage: boolean;
    busy: boolean;
    error: string | null;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  } = $props();

  function close() {
    onOpenChange(false);
  }
</script>

<Dialog
  {open}
  {onOpenChange}
  size="sm"
  variant={isHomePage ? 'default' : 'danger'}
  title={isHomePage ? m.delete_page_modal_cant_delete_title() : m.delete_page_modal_confirm_title()}
  description={isHomePage ? m.delete_page_modal_cant_delete_desc() : m.delete_page_modal_confirm_desc()}
>
  {#if !isHomePage && error}
    <Alert tone="danger">{error}</Alert>
  {/if}
  {#snippet footer()}
    {#if isHomePage}
      <Button variant="primary" onclick={close}>{m.delete_page_modal_close()}</Button>
    {:else}
      <Button variant="secondary" onclick={close} disabled={busy}>{m.delete_page_modal_cancel()}</Button>
      <Button variant="danger" onclick={onConfirm} disabled={busy}>
        {busy ? m.delete_page_modal_deleting() : m.delete_page_modal_delete()}
      </Button>
    {/if}
  {/snippet}
</Dialog>
