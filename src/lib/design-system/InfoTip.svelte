<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The ⓘ help: `text` in a toggletip, where help goes instead of a paragraph
  // under a control. `text` is also the trigger's accessible name.
  import Tooltip from './Tooltip.svelte';
  import Icon from './Icon.svelte';

  let { text, size = 13, side = 'top' }: {
    text: string;
    size?: number;
    side?: 'top' | 'bottom' | 'left' | 'right';
  } = $props();
</script>

<!-- A 24px target around the small glyph, pulled back by a negative margin on
     the trigger itself, so the line keeps the glyph's footprint and the ring
     circles the box. -->
<Tooltip {side} delayDuration={200} toggle triggerProps={{ 'aria-label': text, class: 'ds-infotip', style: `margin: calc((max(1.5rem, var(--ds-target-min)) - ${size / 16}rem) / -2)` }}>
  {#snippet trigger()}
    <span class="ds-infotip-glyph"><Icon name="info" {size} /></span>
  {/snippet}
  {text}
</Tooltip>

<style>
  .ds-infotip-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max(1.5rem, var(--ds-target-min));
    height: max(1.5rem, var(--ds-target-min));
    color: var(--ds-color-muted);
  }
  .ds-infotip-glyph:hover { color: var(--ds-color-fg); }
</style>
