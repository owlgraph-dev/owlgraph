<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The missing-translations badge names the languages any of the row's names
  // lacks (docs/architecture/languages.md).
  import { Badge } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { Locale } from '$lib/paraglide/runtime';
  import { localeName } from '$lib/platform/i18n/localeNames';

  let {
    label,
    title,
    missing = [],
  }: {
    label: string;
    /** The tooltip; the full label when omitted (it may be truncated). */
    title?: string;
    missing?: readonly Locale[];
  } = $props();
</script>

<span class="catalog-label">
  <span class="catalog-label-text" title={title ?? label}>{label}</span>
  {#if missing.length > 0}<Badge tone="warning">{m.settings_catalog_translation_missing({ languages: missing.map(localeName).join(', ') })}</Badge>{/if}
</span>

<style>
  .catalog-label {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    min-width: 0;
  }
  .catalog-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
