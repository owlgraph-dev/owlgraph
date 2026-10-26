<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The tone is colour, glyph and role: `danger` is role="alert", the others
  // role="status". Render it conditionally, so it is announced as it appears.
  // A message about one field is that field's error, not an Alert.
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    tone = 'info',
    layout = 'inline',
    title,
    class: className = '',
    children,
    actions,
  }: {
    tone?: 'danger' | 'warning' | 'info' | 'success';
    /** `banner`: flush and full width, about the whole surface it tops. */
    layout?: 'inline' | 'banner';
    /** A short lead-in, in bold, before the message. */
    title?: string;
    class?: string;
    /** The message. */
    children: Snippet;
    /** Buttons acting on the message, `size="sm"`. */
    actions?: Snippet;
  } = $props();

  const glyph = { danger: 'alert-circle', warning: 'alert-triangle', info: 'info', success: 'check' } as const;
</script>

<div class="ds-alert ds-alert-{tone} ds-alert-{layout} {className}" role={tone === 'danger' ? 'alert' : 'status'}>
  <span class="ds-alert-icon" aria-hidden="true"><Icon name={glyph[tone]} size={16} /></span>
  <div class="ds-alert-body">
    {#if title}<strong class="ds-alert-title">{title}</strong>{/if}
    {@render children()}
  </div>
  {#if actions}<div class="ds-alert-actions">{@render actions()}</div>{/if}
</div>

<style>
  .ds-alert {
    --ds-alert-fg: var(--ds-color-info);
    --ds-alert-bg: var(--ds-color-info-soft);
    display: flex;
    align-items: flex-start;
    gap: var(--ds-space-sm);
    box-sizing: border-box;
    padding: var(--ds-space-sm) 0.75rem;
    background: var(--ds-alert-bg);
    color: var(--ds-alert-fg);
    /* The soft grounds are ~1:1 on the page; a hairline gives the edge. */
    border: 1px solid color-mix(in srgb, var(--ds-alert-fg) 22%, transparent);
    border-radius: var(--ds-radius-sm);
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    line-height: 1.5;
  }
  .ds-alert-danger { --ds-alert-fg: var(--ds-color-danger); --ds-alert-bg: var(--ds-color-danger-soft); }
  .ds-alert-warning { --ds-alert-fg: var(--ds-color-warning); --ds-alert-bg: var(--ds-color-warning-soft); }
  .ds-alert-success { --ds-alert-fg: var(--ds-color-success); --ds-alert-bg: var(--ds-color-success-soft); }
  .ds-alert-banner {
    width: 100%;
    border-width: 0 0 1px;
    border-radius: 0;
    padding: var(--ds-space-sm) var(--ds-space-md);
  }
  /* Centred on the first 1.5em line, so it stays there when the message wraps. */
  .ds-alert-icon { display: inline-flex; flex: none; align-items: center; height: 1.5em; }
  .ds-alert-body { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .ds-alert-title { font-weight: var(--ds-weight-semibold); margin-right: 0.3em; }
  .ds-alert-actions { display: flex; flex: none; align-items: center; gap: var(--ds-space-sm); margin-block: calc((1.5em - var(--ds-control-h-sm)) / 2); }
</style>
