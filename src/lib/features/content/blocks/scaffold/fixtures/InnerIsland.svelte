<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A test fixture (hydrateIslands.test.ts): an island inside another's HTML.
  let { label }: { label: string } = $props();
  let hydrated = $state(false);
  $effect(() => {
    hydrated = true;
  });
</script>

<span class="inner" data-hydrated={hydrated || undefined}>{label}</span>
