<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { EmptyState as DsEmptyState } from '$lib/design-system';
  import type { EmptyKind } from './sections';

  let { kind }: { kind: EmptyKind } = $props();
</script>

<div class="empty">
  <DsEmptyState size="sm">
    {#if kind === 'none'}{m.editor_block_settings_empty_no_selection()}{:else if kind === 'toolbar'}{m.editor_block_settings_empty_toolbar()}{:else}{m.editor_block_settings_empty_no_settings()}{/if}
  </DsEmptyState>
</div>

<style>
  .empty { margin: 0.6rem 0 0; }
</style>
