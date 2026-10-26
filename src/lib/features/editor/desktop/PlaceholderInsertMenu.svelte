<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A placeholder's "+" menu, whose picks replace the placeholder.
  import { placeholderMenuTarget } from '$lib/features/content/editor';
  import { DropdownMenu } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import InsertMenuItems from './InsertMenuItems.svelte';
  import type { InsertCommands } from '../commands/insert';

  let {
    commands,
    enabledPlugins,
  }: {
    commands: InsertCommands;
    /** The plugins turned on (their ids): the menu offers their blocks. */
    enabledPlugins: ReadonlySet<string>;
  } = $props();
</script>

{#if $placeholderMenuTarget}
  {@const pmt = $placeholderMenuTarget}
  <!-- An invisible anchor for a placeholder's "+": its NodeView is raw DOM
    outside the Svelte tree, so it can't be a bits-ui Trigger itself. -->
  <div class="ph-menu-anchor" style="top:{pmt.rect.top}px; left:{pmt.rect.left}px; width:{pmt.rect.width}px; height:{pmt.rect.height}px;">
    <DropdownMenu
      open={true}
      onOpenChange={(o) => { if (!o) placeholderMenuTarget.set(null); }}
      align="start"
      ariaLabel={m.editor_insert_menu_title()}
    >
      {#snippet trigger()}<span aria-hidden="true"></span>{/snippet}
      <InsertMenuItems
        target={{ mode: 'replace', pos: pmt.pos }}
        {enabledPlugins}
        {commands}
        onSelect={() => placeholderMenuTarget.set(null)}
      />
    </DropdownMenu>
  </div>
{/if}

<style>
  /* Sits exactly over the clicked "+"; its trigger is never clicked itself. */
  .ph-menu-anchor { position: fixed; pointer-events: none; z-index: 1; }
  .ph-menu-anchor :global(.ds-menu-trigger) { display: block; width: 100%; height: 100%; }
</style>
