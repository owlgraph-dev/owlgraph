<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `canEdit` is this node's write permission, not AppBar's role-only
  // `userCanEdit`, which would show Edit to people who can't write the node.
  import { Button } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';

  let { canEdit, href }: { canEdit: boolean; href: string | null } = $props();
</script>

{#if canEdit && href}
  <!-- A full navigation: the editor runs under a looser style-src
       (platform/cspRoutes.ts), and a policy belongs to the document. -->
  <span class="desktop-only"><Button variant="ghost" icon {href} data-sveltekit-reload title={m.appbar_page_actions_edit()} aria-label={m.appbar_page_actions_edit()}><Icon name="pencil" /></Button></span>
{/if}

<style>
  .desktop-only { display: inline-flex; }
  /* On a phone, page actions live in the account sheet. */
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .desktop-only { display: none; }
  }
</style>
