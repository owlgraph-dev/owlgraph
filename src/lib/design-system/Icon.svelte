<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Feather-style glyphs (24x24, stroke = currentColor). Many are Feather's
  // (MIT), `monitor` is Lucide's (ISC); their licences are in
  // THIRD-PARTY-NOTICES.md, where a glyph from another set adds its own.
  let { name, size = 18 }: { name: string; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'bold'}
    <path d="M7 5h7a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h8a3.5 3.5 0 0 1 0 7H7z" />
  {:else if name === 'italic'}
    <line x1="19" y1="5" x2="11" y2="5" /><line x1="13" y1="19" x2="5" y2="19" /><line x1="15" y1="5" x2="9" y2="19" />
  {:else if name === 'code'}
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  {:else if name === 'heading'}
    <path d="M6 5v14M18 5v14M6 12h12" />
  {:else if name === 'list'}
    <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  {:else if name === 'list-ordered'}
    <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
    <text x="2" y="8" font-size="7" fill="currentColor" stroke="none">1</text>
    <text x="2" y="14" font-size="7" fill="currentColor" stroke="none">2</text>
    <text x="2" y="20" font-size="7" fill="currentColor" stroke="none">3</text>
  {:else if name === 'link'}
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  {:else if name === 'external-link'}
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  {:else if name === 'trash'}
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  {:else if name === 'plus'}
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  {:else if name === 'check'}
    <polyline points="20 6 9 17 4 12" />
  {:else if name === 'chevron'}
    <polyline points="6 9 12 15 18 9" />
  {:else if name === 'arrow-left'}
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  {:else if name === 'eye'}
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
  {:else if name === 'pencil'}
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  {:else if name === 'sidebar'}
    <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" />
  {:else if name === 'x'}
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  {:else if name === 'braces'}
    <path d="M8 4c-2 0-2.5 1.2-2.5 3.5 0 1.6-.8 2.5-2 2.5 1.2 0 2 .9 2 2.5C5.5 18.8 6 20 8 20" />
    <path d="M16 4c2 0 2.5 1.2 2.5 3.5 0 1.6.8 2.5 2 2.5-1.2 0-2 .9-2 2.5C18.5 18.8 18 20 16 20" />
  {:else if name === 'type'}
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12" y2="8" />
  {:else if name === 'alert-circle'}
    <circle cx="12" cy="12" r="9" /><line x1="12" y1="7.5" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12" y2="16.5" />
  {:else if name === 'alert-triangle'}
    <path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9.5" x2="12" y2="13.5" /><line x1="12" y1="17" x2="12" y2="17" />
  {:else if name === 'table'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="20" />
  {:else if name === 'diagram'}
    <rect x="3" y="3" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" />
    <path d="M6.5 9v3a3 3 0 0 0 3 3h8" />
  {:else if name === 'home'}
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
  {:else if name === 'folder'}
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  {:else if name === 'refresh'}
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
  {:else if name === 'image'}
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
  {:else if name === 'file'}
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
  {:else if name === 'file-text'}
    <!-- A page, as the node types draw it (nodes' NODE_TYPE_GLYPH): a file with lines of text. -->
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><line x1="15" y1="13" x2="9" y2="13" /><line x1="15" y1="17" x2="9" y2="17" />
  {:else if name === 'layers'}
    <!-- A collection: nodes stacked in one set. -->
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  {:else if name === 'graph'}
    <circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="7" r="2.4" /><circle cx="9" cy="18" r="2.4" /><path d="M7.8 7.3l8 -0.6M7.6 7.9l1.2 8" />
  {:else if name === 'sliders'}
    <line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="9" cy="8" r="2.2" fill="var(--ds-color-bg)" /><circle cx="15" cy="16" r="2.2" fill="var(--ds-color-bg)" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  {:else if name === 'moon'}
    <path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6z" />
  {:else if name === 'monitor'}
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
  {:else if name === 'tablet'}
    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" />
  {:else if name === 'phone'}
    <rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" />
  {:else if name === 'menu'}
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  {:else if name === 'more'}
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  {:else if name === 'log-out'}
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  {:else if name === 'lock'}
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  {:else if name === 'tag'}
    <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'wrap-off'}
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="19" y1="6" x2="19" y2="18" stroke-dasharray="2 2" />
  {:else if name === 'wrap-on'}
    <line x1="2" y1="9" x2="16" y2="9" /><line x1="2" y1="15" x2="10" y2="15" />
    <line x1="19" y1="4" x2="19" y2="20" stroke-dasharray="2 2" />
  {:else if name === 'wrap-reverse'}
    <line x1="2" y1="9" x2="10" y2="9" /><line x1="2" y1="15" x2="16" y2="15" />
    <line x1="19" y1="4" x2="19" y2="20" stroke-dasharray="2 2" />
  {:else if name === 'wrap-scroll'}
    <line x1="2" y1="10" x2="22" y2="10" /><polyline points="5 7 2 10 5 13" /><polyline points="19 7 22 10 19 13" />
    <line x1="8" y1="18" x2="16" y2="18" />
  {:else if name === 'grip'}
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'corner-up-left'}
    <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  {:else if name === 'chevron-up'}
    <polyline points="18 15 12 9 6 15" />
  {:else if name === 'chevron-left'}
    <polyline points="15 18 9 12 15 6" />
  {:else if name === 'chevron-right'}
    <polyline points="9 18 15 12 9 6" />
  {:else if name === 'arrow-up-down'}
    <polyline points="7 4 7 20" /><polyline points="3 8 7 4 11 8" /><polyline points="17 20 17 4" /><polyline points="13 16 17 20 21 16" />
  {:else if name === 'layout-grid'}
    <rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" />
  {:else if name === 'arrow-up'}
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  {:else if name === 'column-plus'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="9" y1="4" x2="9" y2="20" />
    <line x1="16" y1="9" x2="16" y2="15" /><line x1="13" y1="12" x2="19" y2="12" />
  {:else if name === 'column-minus'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="9" y1="4" x2="9" y2="20" />
    <line x1="13" y1="12" x2="19" y2="12" />
  {:else if name === 'row-plus'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" />
    <line x1="16" y1="14" x2="16" y2="19" /><line x1="13.5" y1="16.5" x2="18.5" y2="16.5" />
  {:else if name === 'row-minus'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" />
    <line x1="13.5" y1="16.5" x2="18.5" y2="16.5" />
  {:else if name === 'cell-plus'}
    <rect x="3" y="6" width="12" height="12" rx="1.5" /><line x1="18" y1="9" x2="18" y2="15" /><line x1="15" y1="12" x2="21" y2="12" />
  {:else if name === 'cell-minus'}
    <rect x="3" y="6" width="12" height="12" rx="1.5" /><line x1="15" y1="12" x2="21" y2="12" />
  {:else if name === 'flex-row'}
    <rect x="3" y="5" width="4" height="14" rx="1" /><rect x="10" y="5" width="4" height="14" rx="1" /><rect x="17" y="5" width="4" height="14" rx="1" />
  {:else if name === 'flex-column'}
    <rect x="5" y="3" width="14" height="4" rx="1" /><rect x="5" y="10" width="14" height="4" rx="1" /><rect x="5" y="17" width="14" height="4" rx="1" />
  {:else if name === 'select-cells'}
    <rect x="3" y="3" width="18" height="18" rx="1.5" stroke-dasharray="3 2" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" />
  {:else if name === 'table-header'}
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="20" />
    <rect x="3.5" y="4.5" width="17" height="5" fill="currentColor" fill-opacity="0.3" stroke="none" />
  {:else if name === 'width-read'}
    <!-- A block's span: the page's edges, and a band the reading column wide. -->
    <line x1="3" y1="4" x2="3" y2="20" /><line x1="21" y1="4" x2="21" y2="20" /><rect x="9" y="8" width="6" height="8" rx="1" />
  {:else if name === 'width-wide'}
    <line x1="3" y1="4" x2="3" y2="20" /><line x1="21" y1="4" x2="21" y2="20" /><rect x="6.5" y="8" width="11" height="8" rx="1" />
  {:else if name === 'width-full'}
    <line x1="3" y1="4" x2="3" y2="20" /><line x1="21" y1="4" x2="21" y2="20" /><rect x="3" y="8" width="18" height="8" rx="1" />
  {:else if name === 'arrow-right'}
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  {:else if name === 'section-up'}
    <!-- Over the boundary above: into the previous row. -->
    <line x1="5" y1="4" x2="19" y2="4" /><line x1="12" y1="20" x2="12" y2="9" /><polyline points="7 14 12 9 17 14" />
  {:else if name === 'section-down'}
    <line x1="5" y1="20" x2="19" y2="20" /><line x1="12" y1="4" x2="12" y2="15" /><polyline points="7 10 12 15 17 10" />
  {:else if name === 'section-extract'}
    <!-- A row of two cells, and a row of its own below it. -->
    <rect x="3" y="3" width="18" height="7" rx="1" /><line x1="12" y1="3" x2="12" y2="10" /><rect x="3" y="14" width="18" height="7" rx="1" />
  {:else if name === 'align-start'}
    <!-- A box against its column's start edge, centre axis, end edge, or spanning both edges. -->
    <line x1="4" y1="4" x2="4" y2="20" /><rect x="8" y="8" width="9" height="8" rx="1" />
  {:else if name === 'align-center'}
    <line x1="12" y1="3" x2="12" y2="21" /><rect x="6.5" y="8" width="11" height="8" rx="1" />
  {:else if name === 'align-end'}
    <line x1="20" y1="4" x2="20" y2="20" /><rect x="7" y="8" width="9" height="8" rx="1" />
  {:else if name === 'align-stretch'}
    <line x1="3" y1="4" x2="3" y2="20" /><line x1="21" y1="4" x2="21" y2="20" /><line x1="7" y1="12" x2="17" y2="12" /><polyline points="10 9 7 12 10 15" /><polyline points="14 9 17 12 14 15" />
  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  {:else if name === 'expand'}
    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
  {/if}
</svg>
