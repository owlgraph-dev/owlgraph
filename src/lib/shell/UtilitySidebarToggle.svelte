<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Labelled "sidebar", not "graph", so a second panel needs no relabel.
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { localGraphOpen, localGraphWidth } from '$lib/features/graph';

</script>

<!-- Follows the open panel's edge, during a resize too. Undefined while closed,
     so the server renders no style attribute (platform/csp.ts). Inline, since
     the server renders a $derived handed to the directive as a function. -->
<!-- ui-check-allow: raw-element — the right-edge tab: a thin mark that grows into a target on hover and focus, which no Button shape does -->
<button
  class="ust-tab"
  style:right={$localGraphOpen ? `${$localGraphWidth}px` : undefined}
  title={$localGraphOpen ? m.utility_sidebar_hide() : m.utility_sidebar_show()}
  aria-label={$localGraphOpen ? m.utility_sidebar_hide() : m.utility_sidebar_show()}
  aria-pressed={$localGraphOpen}
  onclick={() => localGraphOpen.update((v) => !v)}
>
  <Icon name="sidebar" size={16} />
</button>

<style>
  .ust-tab {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 21;
    /* At rest a quiet edge mark, open or closed; the transparent colour hides
       the currentColor icon. */
    width: 0.5rem;
    height: 2.75rem;
    padding: 0;
    display: grid;
    place-items: center;
    background: var(--ds-color-border);
    color: transparent;
    border: 1px solid transparent;
    border-right: 0;
    border-radius: var(--ds-radius-md) 0 0 var(--ds-radius-md);
    box-shadow: none;
    /* The resting tab is narrower than its icon. */
    overflow: hidden;
    cursor: pointer;
    transition: width 0.15s ease, height 0.15s ease, background-color 0.15s ease, color 0.1s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  /* Grows on hover or keyboard focus, not because the sidebar is open. */
  .ust-tab:hover, .ust-tab:focus-visible {
    width: 1.6rem;
    height: 4rem;
    background: var(--ds-color-accent-soft);
    color: var(--ds-color-accent);
    border-color: var(--ds-color-accent);
    box-shadow: var(--ds-shadow-sm);
  }

  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    /* On a phone the toggle is in the account sheet: an edge tab is hard to
       reach one-handed. */
    .ust-tab { display: none; }
  }
</style>
