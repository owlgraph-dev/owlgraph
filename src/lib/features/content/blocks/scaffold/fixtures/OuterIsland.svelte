<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An island holding another island's HTML that re-renders state of its own.
  let { inner }: { inner: string } = $props();
  let hydrated = $state(false);
  let ticks = $state(0);
  $effect(() => {
    hydrated = true;
    ticks = 1; // 0 on the server
  });
</script>

<section class="outer" data-hydrated={hydrated || undefined}><span class="ticks">{ticks}</span>{@html inner}</section>
