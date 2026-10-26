<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The <td> stays a real table cell: `actions` puts its flex cluster inside.
  // Rows have a fixed height, so long text should `truncate`, not wrap.
  import type { Snippet } from 'svelte';

  let {
    mono = false,
    muted = false,
    truncate = false,
    nowrap = false,
    align = 'start',
    actions = false,
    indent = 0,
    class: className = '',
    children,
    ...rest
  }: {
    /** Code-like identifier (mono face, chip background). */
    mono?: boolean;
    muted?: boolean;
    /** One line with an ellipsis; pair with `title`. A `mono` value truncates too. */
    truncate?: boolean;
    nowrap?: boolean;
    align?: 'start' | 'end';
    /** Right-aligned action cluster (buttons, inline forms). */
    actions?: boolean;
    /** Tree rows: the nesting level, stepped in with a branch glyph. */
    indent?: number;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<td
  class="ds-table-cell {className}"
  class:ds-table-cell-muted={muted}
  class:ds-table-cell-truncate={truncate || mono}
  class:ds-table-cell-nowrap={nowrap}
  class:ds-table-cell-end={align === 'end'}
  style:--ds-table-indent={indent > 0 ? indent : undefined}
  {...rest}
>
  {#if indent > 0}<span class="ds-table-indent-mark" aria-hidden="true">└</span>{/if}
  {#if actions}
    <div class="ds-table-actions">{@render children?.()}</div>
  {:else if mono}
    <code class="ds-table-mono">{@render children?.()}</code>
  {:else}
    {@render children?.()}
  {/if}
</td>

<style>
  .ds-table-cell {
    height: 2.75rem;
    padding: 0 var(--ds-space-sm);
    padding-left: calc(var(--ds-space-sm) + var(--ds-table-indent, 0) * 1.1rem);
    vertical-align: middle;
    text-align: left;
    border-bottom: 1px solid var(--ds-color-border);
    overflow: hidden;
  }
  .ds-table-cell-muted { color: var(--ds-color-muted); }
  .ds-table-cell-truncate,
  .ds-table-cell-nowrap { white-space: nowrap; }
  .ds-table-cell-truncate { text-overflow: ellipsis; }
  .ds-table-cell-end { text-align: right; }
  .ds-table-indent-mark { color: var(--ds-color-muted); margin-right: 0.3rem; }
  .ds-table-mono {
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-sm);
    background: color-mix(in srgb, var(--ds-color-border) 45%, transparent);
    border-radius: var(--ds-radius-sm);
    padding: 0.1em 0.4em;
    white-space: nowrap;
  }
  .ds-table-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--ds-space-sm);
    white-space: nowrap;
  }
  /* Inline <form> wrappers around action buttons must not add a box. */
  .ds-table-actions :global(form) { display: contents; }
</style>
