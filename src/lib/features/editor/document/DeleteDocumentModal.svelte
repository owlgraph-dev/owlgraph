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
    busy,
    error,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    busy: boolean;
    error: string | null;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  } = $props();

  function close() {
    onOpenChange(false);
  }
</script>

<Dialog {open} {onOpenChange} size="sm" variant="danger" title={m.delete_document_modal_confirm_title()} description={m.delete_document_modal_confirm_desc()}>
  {#if error}
    <Alert tone="danger">{error}</Alert>
  {/if}
  {#snippet footer()}
    <Button variant="secondary" onclick={close} disabled={busy}>{m.delete_document_modal_cancel()}</Button>
    <Button variant="danger" onclick={onConfirm} disabled={busy}>
      {busy ? m.delete_document_modal_deleting() : m.delete_document_modal_delete()}
    </Button>
  {/snippet}
</Dialog>
