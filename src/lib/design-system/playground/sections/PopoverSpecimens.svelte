<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Popover from '../../Popover.svelte';
  import Button from '../../Button.svelte';
  import FieldRow from '../../FieldRow.svelte';
  import Switch from '../../Switch.svelte';
  import Input from '../../Input.svelte';
  import Icon from '../../Icon.svelte';
  import TriggerFace from '../../TriggerFace.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const sides = ['top', 'bottom', 'left', 'right'] as const;
  const aligns = ['start', 'center', 'end'] as const;

  let border = $state(true);
  let focusOpen = $state(false);
  const targetId = 'pg-popover-focus-target';

  // Apply-and-close: the action moved focus already, so Bits UI's
  // refocus-the-trigger is suppressed.
  function keepFocusOnInput(e: Event) {
    e.preventDefault();
    document.getElementById(targetId)?.focus();
  }
</script>

<SpecimenGrid title="Trigger + content">
  <Specimen label="controls inside (FieldRow + Switch, Button)" state="controls" overlay>
    <Popover>
      {#snippet trigger()}<TriggerFace variant="secondary">Border <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <div class="panel">
        <FieldRow label="Show border">
          <Switch bind:checked={border} ariaLabel="Show border" />
        </FieldRow>
        <Button size="sm" variant="ghost" onclick={() => (border = true)}>Reset</Button>
      </div>
    </Popover>
  </Specimen>
  <Specimen label="icon trigger, aria-label via triggerProps" state="icon-trigger" overlay>
    <Popover triggerProps={{ 'aria-label': 'Options', title: 'Options' }}>
      {#snippet trigger()}<TriggerFace variant="secondary" icon><Icon name="sliders" size={16} /></TriggerFace>{/snippet}
      <div class="panel">
        <FieldRow label="Sticky"><Switch checked={false} ariaLabel="Sticky" /></FieldRow>
        <FieldRow label="Wrap"><Switch checked={true} ariaLabel="Wrap" /></FieldRow>
      </div>
    </Popover>
  </Specimen>
  <Specimen label="disabled (trigger cannot open)" state="disabled">
    <Popover disabled>
      {#snippet trigger()}<TriggerFace variant="secondary">No selection</TriggerFace>{/snippet}
      <div class="panel">Never shown.</div>
    </Popover>
  </Specimen>
  <Specimen label="size=md: a picker's width, bounded to the window" state="size-md" overlay>
    <Popover size="md">
      {#snippet trigger()}<TriggerFace variant="secondary">Link</TriggerFace>{/snippet}
      <p class="wide">Wide enough for a search field, a row's title and the line beneath it — the link picker's popover.</p>
    </Popover>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Sides (align=start)">
  {#each sides as side (side)}
    <Specimen label="side={side}" state="side-{side}" overlay>
      <Popover {side}>
        {#snippet trigger()}<TriggerFace variant="secondary">{side}</TriggerFace>{/snippet}
        <div class="panel">Opens on the {side}.</div>
      </Popover>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Aligns (side=bottom)">
  {#each aligns as align (align)}
    <Specimen label="align={align}" state="align-{align}" overlay>
      <Popover side="bottom" {align}>
        {#snippet trigger()}<TriggerFace variant="secondary">align {align}</TriggerFace>{/snippet}
        <div class="panel">Aligned {align}.</div>
      </Popover>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Focus on close">
  <Specimen label="onCloseAutoFocus: preventDefault, then focus the input (not the trigger)" state="close-auto-focus" overlay>
    <Popover bind:open={focusOpen} onCloseAutoFocus={keepFocusOnInput}>
      {#snippet trigger()}<TriggerFace variant="secondary">Pick a value</TriggerFace>{/snippet}
      <div class="panel">
        <Button size="sm" variant="primary" onclick={() => (focusOpen = false)}>Apply and close</Button>
      </div>
    </Popover>
    <Input id={targetId} value="" placeholder="Focus lands here after closing" aria-label="Focus target" />
  </Specimen>
</SpecimenGrid>

<style>
  .wide { margin: 0; padding: var(--ds-space-sm); font-size: var(--ds-text-md); color: var(--ds-color-fg); }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    min-width: 12rem;
    padding: var(--ds-space-sm);
  }
</style>
