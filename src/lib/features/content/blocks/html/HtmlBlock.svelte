<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The callers sanitize `html`, never this component.
  let {
    html = '',
    empty = null,
  }: {
    /** Already sanitized. */
    html?: string;
    /** The editor's hint for a block with no HTML; null on the page. */
    empty?: string | null;
  } = $props();
</script>

{#if html}{@html html}{:else if empty}<em>{empty}</em>{/if}
