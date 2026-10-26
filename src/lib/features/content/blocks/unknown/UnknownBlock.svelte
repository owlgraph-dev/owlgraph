<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Editor only (docs/architecture/blocks/anatomy.md, "Unknown blocks"): what the block was, and that it is kept.
  import type { UnknownBlockProps } from './view';

  let { title, note }: UnknownBlockProps = $props();
</script>

<div class="unknown-block-box">
  <svg class="unknown-block-glyph" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
  <span class="unknown-block-text">
    <span class="unknown-block-title">{title}</span>
    <span class="unknown-block-note">{note}</span>
  </span>
</div>
