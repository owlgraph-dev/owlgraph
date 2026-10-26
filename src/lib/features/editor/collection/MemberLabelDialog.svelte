<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // What the collection calls a member, per language (docs/architecture/semantic-layer.md,
  // "Collections"). Mounted fresh per open, so the field starts from the label.
  import { untrack } from 'svelte';
  import { Button, Dialog } from '$lib/design-system';
  import { LocalizedField } from '$lib/features/semantic/components';
  import * as m from '$lib/paraglide/messages';
  import type { LocalizedText } from '$lib/platform/i18n/localizedText';

  let {
    open,
    onOpenChange,
    title,
    label,
    busy = false,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The member's own title. */
    title: string;
    label: LocalizedText | null;
    busy?: boolean;
    onSave: (label: LocalizedText | null) => void;
  } = $props();

  let value = $state<Record<string, string | undefined>>(untrack(() => ({ ...label })));
  const filled = $derived(Object.values(value).some((text) => !!text?.trim()));

  function save() {
    const text = Object.fromEntries(Object.entries(value).filter(([, v]) => !!v?.trim())) as LocalizedText;
    onSave(Object.keys(text).length > 0 ? text : null);
  }
</script>

<Dialog {open} {onOpenChange} size="md" title={m.collection_member_label_title()}>
  <form
    id="member-label-form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <LocalizedField label={m.collection_member_label_field()} name="label" bind:value hint={m.collection_member_label_hint({ title })} autofocus />
  </form>
  {#snippet footer()}
    {#if label}<Button type="button" variant="ghost-danger" disabled={busy} onclick={() => onSave(null)}>{m.collection_member_label_clear()}</Button>{/if}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.collection_member_label_cancel()}</Button>
    <Button type="submit" form="member-label-form" variant="primary" loading={busy} disabled={!filled && !label}>{m.collection_member_label_save()}</Button>
  {/snippet}
</Dialog>
