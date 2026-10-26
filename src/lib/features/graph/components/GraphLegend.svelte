<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { browser } from '$app/environment';
  import * as m from '$lib/paraglide/messages';
  import type { LegendEntry } from '../nodeColor';

  let { entries }: { entries: LegendEntry[] } = $props();
</script>

{#if entries.length}
  <ul class="legend" aria-label={m.graph_legend_aria()}>
    {#each entries as e (e.key)}
      <!-- Set in the browser: a server-rendered style attribute is blocked by the
           reader's strict style-src (docs/architecture/overview.md#content-security-policy). -->
      <li><span class="key" class:square={e.shape === 'square'} class:diamond={e.shape === 'diamond'} style:background={browser ? e.color : undefined}></span>{e.label}</li>
    {/each}
  </ul>
{/if}

<style>
  .legend {
    position: absolute; left: 0.6rem; bottom: 0.6rem; z-index: 2;
    display: flex; flex-wrap: wrap; gap: 0.35rem 0.8rem; max-width: calc(100% - 1.2rem);
    margin: 0; padding: 0.3rem 0.5rem; list-style: none;
    font-size: var(--ds-text-sm); color: var(--ds-color-muted);
    background: var(--ds-color-bg); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-sm);
  }
  .legend li { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
  .key { width: 10px; height: 10px; display: inline-block; border-radius: 50%; }
  .key.square { border-radius: 2px; }
  .key.diamond { border-radius: 1px; transform: rotate(45deg) scale(0.85); }
</style>
