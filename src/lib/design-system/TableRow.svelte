<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Carries the row styles, since Table's scoped CSS can't reach a consumer's <tr>.
  import type { Snippet } from 'svelte';

  let {
    tone = 'default',
    class: className = '',
    children,
    ...rest
  }: {
    /** `muted`: a structurally different row (a locked core entry), tinted at rest. */
    tone?: 'default' | 'muted';
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<tr class="ds-table-row {className}" class:ds-table-row-muted={tone === 'muted'} {...rest}>
  {@render children?.()}
</tr>

<style>
  .ds-table-row:hover { background: color-mix(in srgb, var(--ds-color-border) 35%, transparent); }
  .ds-table-row-muted { background: color-mix(in srgb, var(--ds-color-border) 25%, transparent); }
  .ds-table-row-muted:hover { background: color-mix(in srgb, var(--ds-color-border) 45%, transparent); }
</style>
