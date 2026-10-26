<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import DropdownMenu from '../../DropdownMenu.svelte';
  import DropdownMenuItem from '../../DropdownMenuItem.svelte';
  import DropdownMenuSeparator from '../../DropdownMenuSeparator.svelte';
  import DropdownMenuGroup from '../../DropdownMenuGroup.svelte';
  import DropdownMenuGroupHeading from '../../DropdownMenuGroupHeading.svelte';
  import Icon from '../../Icon.svelte';
  import TriggerFace from '../../TriggerFace.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const aligns = ['start', 'center', 'end'] as const;

  let lastAction = $state('none yet');
  let grid = $state(true);
  let rulers = $state(false);
</script>

<SpecimenGrid title="Items">
  <Specimen label="plain, href, active, disabled, danger + separator" state="items" overlay>
    <DropdownMenu ariaLabel="Page actions" align="start">
      {#snippet trigger()}<TriggerFace variant="secondary">Actions <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem onSelect={() => (lastAction = 'Rename')}>Rename</DropdownMenuItem>
      <DropdownMenuItem href="/dev/design-system?section=dropdown-menu">Open (href, real anchor)</DropdownMenuItem>
      <DropdownMenuItem active onSelect={() => (lastAction = 'Pinned')}>Pinned (active)</DropdownMenuItem>
      <DropdownMenuItem disabled>Move (disabled)</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="danger" onSelect={() => (lastAction = 'Delete')}>Delete</DropdownMenuItem>
    </DropdownMenu>
    <span class="log">last: {lastAction}</span>
  </Specimen>
  <Specimen label="checked toggles + closeOnSelect=false (menuitemcheckbox, menu stays open)" state="close-on-select-false" overlay>
    <DropdownMenu ariaLabel="View options" align="start">
      {#snippet trigger()}<TriggerFace variant="secondary">View <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem closeOnSelect={false} checked={grid} onSelect={() => (grid = !grid)}>Grid</DropdownMenuItem>
      <DropdownMenuItem closeOnSelect={false} checked={rulers} onSelect={() => (rulers = !rulers)}>Rulers</DropdownMenuItem>
    </DropdownMenu>
  </Specimen>
  <Specimen label="groups with headings (role=group, named by the heading; the arrows skip it)" state="groups" overlay>
    <DropdownMenu ariaLabel="Insert" align="start">
      {#snippet trigger()}<TriggerFace variant="secondary">Insert <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem onSelect={() => (lastAction = 'Paragraph')}>Paragraph</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => (lastAction = 'Image')}>Image</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuGroupHeading>Integrations</DropdownMenuGroupHeading>
        <DropdownMenuItem onSelect={() => (lastAction = 'Folder')}>Folder</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => (lastAction = 'File')}>File</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenu>
  </Specimen>
  <Specimen label="disabled (trigger cannot open)" state="disabled">
    <DropdownMenu ariaLabel="Page actions" disabled>
      {#snippet trigger()}<TriggerFace variant="secondary">Actions <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
      <DropdownMenuItem>Never shown</DropdownMenuItem>
    </DropdownMenu>
  </Specimen>
  <Specimen label="icon trigger, aria-label via triggerProps" state="icon-trigger" overlay>
    <DropdownMenu ariaLabel="More actions" triggerProps={{ 'aria-label': 'More actions', title: 'More actions' }}>
      {#snippet trigger()}<TriggerFace variant="ghost" icon><Icon name="more" size={16} /></TriggerFace>{/snippet}
      <DropdownMenuItem onSelect={() => (lastAction = 'Duplicate')}>Duplicate</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => (lastAction = 'Archive')}>Archive</DropdownMenuItem>
    </DropdownMenu>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Align (relative to the trigger)">
  {#each aligns as align (align)}
    <Specimen label="align={align}" state="align-{align}" overlay>
      <DropdownMenu ariaLabel="Align {align}" {align}>
        {#snippet trigger()}<TriggerFace variant="secondary">align {align} <Icon name="chevron" size={14} /></TriggerFace>{/snippet}
        <DropdownMenuItem>First</DropdownMenuItem>
        <DropdownMenuItem>Second</DropdownMenuItem>
      </DropdownMenu>
    </Specimen>
  {/each}
</SpecimenGrid>

<style>
  .log { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
