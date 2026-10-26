<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The open state is session-wide per `id`, so a section folds the same on
  // every block.
  import { CollapsibleGroup } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { Snippet } from 'svelte';
  import { isSectionOpen, setSectionOpen } from './blockSettingsState.svelte';
  import type { CapabilitySectionId } from './sections';

  let { id, title, modified = false, children }: {
    id: 'block' | `block:${string}` | CapabilitySectionId;
    title: string;
    modified?: boolean;
    children?: Snippet;
  } = $props();

  const open = $derived(isSectionOpen(id));
</script>

<CollapsibleGroup {title} {open} onOpenChange={(o) => setSectionOpen(id, o)} {modified} modifiedTitle={m.editor_block_settings_modified()}>
  {@render children?.()}
</CollapsibleGroup>
