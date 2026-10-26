<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Tooltip from '../../Tooltip.svelte';
  import Icon from '../../Icon.svelte';
  import TriggerFace from '../../TriggerFace.svelte';
  import Switch from '../../Switch.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const sides = ['top', 'bottom', 'left', 'right'] as const;

  let controlledOpen = $state(false);
  let anchorEl = $state<HTMLElement | null>(null);
</script>

<SpecimenGrid title="Trigger snippet (hover or keyboard focus opens)">
  <Specimen label="text trigger" state="trigger" overlay="hover">
    <Tooltip>
      {#snippet trigger()}<TriggerFace variant="secondary" size="sm">Hover or focus me</TriggerFace>{/snippet}
      Short help, shown after the default delay.
    </Tooltip>
  </Specimen>
  <Specimen label="icon trigger, aria-label via triggerProps" state="trigger-icon" overlay="hover">
    <Tooltip triggerProps={{ 'aria-label': 'What is a namespace?' }}>
      {#snippet trigger()}<span class="glyph"><Icon name="info" size={14} /></span>{/snippet}
      A namespace groups pages under one visibility rule.
    </Tooltip>
  </Specimen>
  <Specimen label="toggle: a click or tap pins it open (a toggletip, InfoTip's shape)" state="toggle" overlay>
    <Tooltip toggle triggerProps={{ 'aria-label': 'What is a layout?' }}>
      {#snippet trigger()}<span class="glyph"><Icon name="info" size={14} /></span>{/snippet}
      Pinned until a second click, Escape or a click outside — touch has no hover.
    </Tooltip>
  </Specimen>
  <Specimen label="delayDuration=0 (instant)" state="delay-0">
    <Tooltip delayDuration={0}>
      {#snippet trigger()}<TriggerFace variant="secondary" size="sm">No delay</TriggerFace>{/snippet}
      Opens the moment the pointer arrives.
    </Tooltip>
  </Specimen>
  <Specimen label="disabled (dimmed, does not open)" state="disabled">
    <Tooltip disabled>
      {#snippet trigger()}<TriggerFace variant="secondary" size="sm">Unavailable</TriggerFace>{/snippet}
      Never shown.
    </Tooltip>
  </Specimen>
  <Specimen label="delayDuration=900" state="delay-900">
    <Tooltip delayDuration={900}>
      {#snippet trigger()}<TriggerFace variant="secondary" size="sm">Slow</TriggerFace>{/snippet}
      Opens after almost a second of hover.
    </Tooltip>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Sides">
  {#each sides as side (side)}
    <Specimen label="side={side}" state="side-{side}">
      <Tooltip {side} delayDuration={100}>
        {#snippet trigger()}<TriggerFace variant="secondary" size="sm">{side}</TriggerFace>{/snippet}
        Placed on the {side} of the trigger.
      </Tooltip>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Controlled (no trigger rendered)">
  <Specimen label="open bound to a Switch, customAnchor = the dashed box" state="controlled">
    <Switch bind:checked={controlledOpen}>Show tooltip</Switch>
    <span class="anchor" bind:this={anchorEl}>anchor</span>
    <Tooltip bind:open={controlledOpen} customAnchor={anchorEl} side="bottom">
      Positioned against the anchor element; open/close is instant because no trigger owns the delay.
    </Tooltip>
  </Specimen>
</SpecimenGrid>

<style>
  .glyph { display: inline-flex; align-items: center; color: var(--ds-color-muted); }
  .anchor {
    display: inline-flex;
    align-items: center;
    padding: var(--ds-space-sm) var(--ds-space-md);
    border: 1px dashed var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
</style>
