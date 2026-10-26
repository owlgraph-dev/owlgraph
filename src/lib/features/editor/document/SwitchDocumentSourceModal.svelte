<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Switching to a link deletes the stored file, hence the danger dialog.
  import { Dialog, Button, Alert } from '$lib/design-system';
  import type { DocumentSource } from '$lib/features/documents';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    target,
    busy,
    error,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    target: DocumentSource;
    busy: boolean;
    error: string | null;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  } = $props();

  const toLink = $derived(target === 'link');
</script>

<Dialog
  {open}
  {onOpenChange}
  size="sm"
  variant={toLink ? 'danger' : 'default'}
  title={toLink ? m.document_switch_to_link_title() : m.document_switch_to_upload_title()}
  description={toLink ? m.document_switch_to_link_desc() : m.document_switch_to_upload_desc()}
>
  {#if error}
    <Alert tone="danger">{error}</Alert>
  {/if}
  {#snippet footer()}
    <Button variant="secondary" onclick={() => onOpenChange(false)} disabled={busy}>{m.document_switch_cancel()}</Button>
    <Button variant={toLink ? 'danger' : 'primary'} onclick={onConfirm} loading={busy}>
      {toLink ? m.document_switch_confirm_delete() : m.document_switch_confirm()}
    </Button>
  {/snippet}
</Dialog>
