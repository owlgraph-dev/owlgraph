<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Only the controls: each catalogue page filters its own rows with catalogFilter.ts.
  import { Input, Switch } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    query = $bindable(''),
    missingOnly = $bindable(false),
    missingCount,
  }: {
    query?: string;
    missingOnly?: boolean;
    /** Rows with a missing translation, over the whole catalog. */
    missingCount: number;
  } = $props();
</script>

<div class="catalog-filter">
  <div class="catalog-filter-search">
    <Input type="search" bind:value={query} placeholder={m.settings_catalog_filter_search_placeholder()} aria-label={m.settings_catalog_filter_search_aria()} />
  </div>
  <Switch bind:checked={missingOnly} disabled={missingCount === 0 && !missingOnly}>{m.settings_catalog_filter_missing({ count: missingCount })}</Switch>
</div>

<style>
  .catalog-filter {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-sm) var(--ds-space-md);
    margin-bottom: var(--ds-space-md);
  }
  .catalog-filter-search { flex: 0 1 20rem; min-width: 12rem; }
</style>
