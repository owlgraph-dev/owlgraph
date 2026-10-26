<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { GraphView } from '$lib/features/graph/components';
  let { data } = $props();
</script>

<div class="graph-page">
  <GraphView nodes={data.nodes} edges={data.edges} classOptions={data.classOptions} namespaces={data.namespaces} fill />
</div>

<style>
  /* Full-bleed shell inset by the app bar — same pattern as the editor. */
  .graph-page { position: fixed; top: var(--appbar-top-h); right: 0; bottom: 0; left: 0; background: var(--ds-color-bg); z-index: 1; }
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    /* The bar is at the bottom here. */
    .graph-page { top: 0; bottom: calc(var(--appbar-h) + env(safe-area-inset-bottom)); }
  }
</style>
