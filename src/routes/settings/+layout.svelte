<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The sections tree, filtered to the `:manage` actions the viewer holds.
  // Visibility only: each section's route enforces its action on the server.
  import { page } from '$app/stores';
  import SettingsShell from '$lib/shell/settings/SettingsShell.svelte';
  import { OVERVIEW, SETTINGS_TREE } from '$lib/shell/settings/tree';
  import { activeItemId, visibleTree } from '$lib/shell/settings/treeModel';
  import * as m from '$lib/paraglide/messages';

  let { data, children } = $props();

  const groups = $derived(visibleTree(SETTINGS_TREE, new Set(data.permissions)));
  const activeId = $derived(activeItemId(groups, $page.url.pathname));
  const activeLabel = $derived(
    groups.flatMap((g) => g.items).find((i) => i.id === activeId)?.label() ?? OVERVIEW.label()
  );
</script>

<svelte:head>
  <title>{activeLabel} · {m.settings_title()}</title>
</svelte:head>

<SettingsShell {groups} {activeId} {activeLabel}>
  {@render children()}
</SettingsShell>
