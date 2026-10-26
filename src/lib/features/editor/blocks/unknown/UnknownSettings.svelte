<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Nothing to set: only what the block is and what keeping or deleting it
  // means (docs/architecture/blocks/anatomy.md, "Unknown blocks").
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target }: BlockSettingsProps = $props();

  const type = $derived(String(target.attrs.originalType ?? ''));
  const plugin = $derived(typeof target.attrs.plugin === 'string' && target.attrs.plugin ? target.attrs.plugin : null);
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)}>
  <p class="us-line"><span class="us-label">{m.editor_unknown_block_type()}</span> <code class="us-type">{type}</code></p>
  {#if plugin}
    <p class="us-line"><span class="us-label">{m.editor_unknown_block_plugin()}</span> {plugin}</p>
  {/if}
  <p class="us-note">{m.editor_unknown_block_info()}</p>
</BlockSettingsSection>

<style>
  .us-line { margin: 0 0 calc(var(--ds-space-sm) / 2); font-size: var(--ds-text-sm); color: var(--ds-color-fg); overflow-wrap: anywhere; }
  .us-label { color: var(--ds-color-muted); }
  .us-type { font-family: var(--ds-font-mono); font-size: var(--ds-text-sm); }
  .us-note { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); line-height: 1.45; }
</style>
