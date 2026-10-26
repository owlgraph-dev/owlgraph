<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import CreateModal from '../create-modal/CreateModal.svelte';
  import * as m from '$lib/paraglide/messages';

  // canEdit only hides the trigger; the create endpoints enforce the permission.
  let {
    canEdit,
    open,
    onOpenChange
  }: { canEdit: boolean; open: boolean; onOpenChange: (open: boolean) => void } = $props();
</script>

{#if canEdit}
  <span class="desktop-only"><Button variant="ghost" icon onclick={() => onOpenChange(true)} title={m.account_menu_create()} aria-label={m.account_menu_create()}><Icon name="plus" /></Button></span>
{/if}

<CreateModal {open} {onOpenChange} />

<style>
  .desktop-only { display: inline-flex; }
  /* On a phone, Create lives in the account sheet. */
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .desktop-only { display: none; }
  }
</style>
