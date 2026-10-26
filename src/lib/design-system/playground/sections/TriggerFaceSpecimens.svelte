<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import TriggerFace from '../../TriggerFace.svelte';
  import Popover from '../../Popover.svelte';
  import DropdownMenu from '../../DropdownMenu.svelte';
  import DropdownMenuItem from '../../DropdownMenuItem.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';
</script>

<SpecimenGrid title="Variants (open one: the face turns active; hover and press are live)">
  <Specimen label="secondary md / sm" state="secondary" overlay>
    <DropdownMenu ariaLabel="Actions" align="start">
      {#snippet trigger()}<TriggerFace variant="secondary">Actions <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem>Rename</DropdownMenuItem>
      <DropdownMenuItem>Duplicate</DropdownMenuItem>
    </DropdownMenu>
    <Popover>
      {#snippet trigger()}<TriggerFace variant="secondary" size="sm">Border <Icon name="chevron" size={12} /></TriggerFace>{/snippet}
      <p class="panel">Border settings.</p>
    </Popover>
  </Specimen>
  <Specimen label="ghost icon md / sm (a header's more menu)" state="ghost" overlay>
    <DropdownMenu ariaLabel="More" triggerProps={{ 'aria-label': 'More', title: 'More' }}>
      {#snippet trigger()}<TriggerFace variant="ghost" icon><Icon name="more" /></TriggerFace>{/snippet}
      <DropdownMenuItem>View page</DropdownMenuItem>
    </DropdownMenu>
    <Popover triggerProps={{ 'aria-label': 'Tags', title: 'Tags' }}>
      {#snippet trigger()}<TriggerFace variant="ghost" size="sm" icon><Icon name="tag" /></TriggerFace>{/snippet}
      <p class="panel">Tags.</p>
    </Popover>
  </Specimen>
  <Specimen label="toolbar md: label, icon, split chevron" state="toolbar" overlay>
    <DropdownMenu ariaLabel="Insert" align="start">
      {#snippet trigger()}<TriggerFace variant="toolbar"><Icon name="plus" size={16} /><span>Insert</span><Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem>Table</DropdownMenuItem>
    </DropdownMenu>
    <Popover triggerProps={{ 'aria-label': 'Link', title: 'Link' }}>
      {#snippet trigger()}<TriggerFace variant="toolbar" icon><Icon name="link" /></TriggerFace>{/snippet}
      <p class="panel">Link picker.</p>
    </Popover>
    <Popover triggerProps={{ 'aria-label': 'Weight', title: 'Weight' }}>
      {#snippet trigger()}<TriggerFace variant="toolbar" split><Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <p class="panel">Weight.</p>
    </Popover>
  </Specimen>
  <Specimen label="toolbar sm (a breadcrumb, a row's trailing action) + active (a state the overlay doesn't know)" state="toolbar-sm" overlay>
    <Popover triggerProps={{ 'aria-label': 'Per side', title: 'Per side' }}>
      {#snippet trigger()}<TriggerFace variant="toolbar" size="sm" active><Icon name="sliders" size={14} /><span>2</span></TriggerFace>{/snippet}
      <p class="panel">Per-side values.</p>
    </Popover>
    <DropdownMenu ariaLabel="Hidden levels" triggerProps={{ 'aria-label': 'Hidden levels', title: 'Hidden levels' }}>
      {#snippet trigger()}<TriggerFace variant="toolbar" size="sm" icon><Icon name="more" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem>Section</DropdownMenuItem>
    </DropdownMenu>
  </Specimen>
  <Specimen label="disabled trigger (no hover, dimmed by the overlay)" state="disabled">
    <Popover disabled>
      {#snippet trigger()}<TriggerFace variant="secondary">No selection</TriggerFace>{/snippet}
      <p class="panel">Never shown.</p>
    </Popover>
  </Specimen>
</SpecimenGrid>

<style>
  .panel { margin: 0; padding: var(--ds-space-sm); font-size: var(--ds-text-sm); }
</style>
