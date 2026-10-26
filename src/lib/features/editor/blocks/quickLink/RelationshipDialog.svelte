<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A quick-link card's typed edge. Mounted fresh for each edit, so the draft
  // starts from the card's stored values.
  import { untrack } from 'svelte';
  import { Button, Dialog } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { RelationshipPicker } from '$lib/features/semantic/components';

  let {
    relationshipType,
    properties,
    onSave,
    onCancel,
  }: {
    relationshipType: string | null;
    properties: Record<string, string>;
    onSave: (next: { relationshipType: string | null; properties: Record<string, string> }) => void;
    onCancel: () => void;
  } = $props();

  let draftType = $state(untrack(() => relationshipType));
  let draftProperties = $state(untrack(() => properties));
</script>

<Dialog open onOpenChange={(o) => { if (!o) onCancel(); }} size="md" title={m.relationship_picker_label()}>
  <RelationshipPicker
    relationshipType={draftType}
    properties={draftProperties}
    onUpdateAttr={(attr, value) => {
      if (attr === 'relationshipType') draftType = value as string | null;
      else if (attr === 'properties') draftProperties = value as Record<string, string>;
    }}
  />
  {#snippet footer()}
    <Button variant="secondary" onclick={onCancel}>{m.editor_edit_cancel()}</Button>
    <Button variant="primary" onclick={() => onSave({ relationshipType: draftType, properties: draftProperties })}>{m.editor_edit_save()}</Button>
  {/snippet}
</Dialog>
