<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Raw for the composed menu trigger only (docs/architecture/design-system/patterns.md, "Composing
  // Toolbar with overlay triggers").
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import Toolbar from '../../Toolbar.svelte';
  import ToolbarButton from '../../ToolbarButton.svelte';
  import ToolbarGroup from '../../ToolbarGroup.svelte';
  import ToolbarGroupItem from '../../ToolbarGroupItem.svelte';
  import DropdownMenu from '../../DropdownMenu.svelte';
  import DropdownMenuItem from '../../DropdownMenuItem.svelte';
  import Icon from '../../Icon.svelte';
  import TriggerFace from '../../TriggerFace.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // One-way `value`; only the items' own onclick changes it.
  let block = $state('heading');
  let marks = $state<string[]>(['bold']);
  let inserted = $state('nothing yet');

  function toggleMark(mark: string) {
    marks = marks.includes(mark) ? marks.filter((m) => m !== mark) : [...marks, mark];
  }
</script>

<SpecimenGrid title="ToolbarButton">
  <Specimen label="variant=ghost / primary" state="button-variants">
    <Toolbar aria-label="Variants">
      <ToolbarButton title="Bold" aria-label="Bold"><Icon name="bold" /></ToolbarButton>
      <ToolbarButton title="Italic" aria-label="Italic"><Icon name="italic" /></ToolbarButton>
      <ToolbarButton variant="primary">Publish</ToolbarButton>
    </Toolbar>
  </Specimen>
  <Specimen label="size=sm (in-canvas overlay) / md" state="button-sizes">
    <Toolbar aria-label="Sizes">
      <ToolbarButton size="sm" title="Bold" aria-label="Bold"><Icon name="bold" size={14} /></ToolbarButton>
      <ToolbarButton size="sm" title="Link" aria-label="Link"><Icon name="link" size={14} /></ToolbarButton>
      <span class="sep"></span>
      <ToolbarButton title="Bold" aria-label="Bold"><Icon name="bold" /></ToolbarButton>
      <ToolbarButton title="Link" aria-label="Link"><Icon name="link" /></ToolbarButton>
    </Toolbar>
  </Specimen>
  <Specimen label="active / danger / disabled" state="button-states">
    <Toolbar aria-label="States">
      <ToolbarButton active title="Code" aria-label="Code"><Icon name="code" /></ToolbarButton>
      <ToolbarButton variant="ghost-danger" title="Delete block" aria-label="Delete block"><Icon name="trash" /></ToolbarButton>
      <ToolbarButton disabled title="Table" aria-label="Table"><Icon name="table" /></ToolbarButton>
      <ToolbarButton variant="primary" disabled>Publish</ToolbarButton>
    </Toolbar>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="ToolbarGroup (arrow keys move between items; one Tab stop)">
  <Specimen label="type=single; value one-way; onValueChange guards the empty reset" state="group-single">
    <Toolbar aria-label="Block type">
      <ToolbarGroup type="single" value={block} onValueChange={(v) => { if (typeof v === 'string' && v) block = v; }}>
        <ToolbarGroupItem value="heading" title="Heading" aria-label="Heading" onclick={() => (block = 'heading')}><Icon name="heading" /></ToolbarGroupItem>
        <ToolbarGroupItem value="list" title="Bullet list" aria-label="Bullet list" onclick={() => (block = 'list')}><Icon name="list" /></ToolbarGroupItem>
        <ToolbarGroupItem value="list-ordered" title="Numbered list" aria-label="Numbered list" onclick={() => (block = 'list-ordered')}><Icon name="list-ordered" /></ToolbarGroupItem>
      </ToolbarGroup>
    </Toolbar>
    <span class="log">value: {block}</span>
  </Specimen>
  <Specimen label="type=multiple; each item's onclick toggles its mark" state="group-multiple">
    <Toolbar aria-label="Marks">
      <ToolbarGroup type="multiple" value={marks}>
        <ToolbarGroupItem value="bold" title="Bold" aria-label="Bold" onclick={() => toggleMark('bold')}><Icon name="bold" /></ToolbarGroupItem>
        <ToolbarGroupItem value="italic" title="Italic" aria-label="Italic" onclick={() => toggleMark('italic')}><Icon name="italic" /></ToolbarGroupItem>
        <ToolbarGroupItem value="code" title="Code" aria-label="Code" onclick={() => toggleMark('code')}><Icon name="code" /></ToolbarGroupItem>
      </ToolbarGroup>
    </Toolbar>
    <span class="log">value: [{marks.join(', ')}]</span>
  </Specimen>
  <Specimen label="size=sm items, one disabled" state="group-sm-disabled">
    <Toolbar aria-label="Compact marks">
      <ToolbarGroup type="multiple" value={marks}>
        <ToolbarGroupItem size="sm" value="bold" title="Bold" aria-label="Bold" onclick={() => toggleMark('bold')}><Icon name="bold" size={14} /></ToolbarGroupItem>
        <ToolbarGroupItem size="sm" value="italic" title="Italic" aria-label="Italic" onclick={() => toggleMark('italic')}><Icon name="italic" size={14} /></ToolbarGroupItem>
        <ToolbarGroupItem size="sm" value="code" disabled title="Code" aria-label="Code"><Icon name="code" size={14} /></ToolbarGroupItem>
      </ToolbarGroup>
    </Toolbar>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Composed: a DropdownMenu trigger inside the roving-tabindex set">
  <Specimen label="BitsToolbar.Button child → DropdownMenu triggerProps (menu trigger first, then plain buttons)" state="menu" overlay>
    <Toolbar aria-label="Insert">
      <BitsToolbar.Button>
        {#snippet child({ props: toolbarProps }: { props: Record<string, unknown> })}
          <DropdownMenu ariaLabel="Insert block" align="start" triggerProps={{ ...toolbarProps, 'aria-label': 'Insert block', title: 'Insert block' }}>
            {#snippet trigger()}<TriggerFace variant="toolbar"><Icon name="plus" /><Icon name="chevron" size={12} /></TriggerFace>{/snippet}
            <DropdownMenuItem onSelect={() => (inserted = 'Table')}>Table</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (inserted = 'Heading')}>Heading</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (inserted = 'Bullet list')}>Bullet list</DropdownMenuItem>
          </DropdownMenu>
        {/snippet}
      </BitsToolbar.Button>
      <span class="sep"></span>
      <ToolbarButton title="Link" aria-label="Link"><Icon name="link" /></ToolbarButton>
      <ToolbarButton title="Table" aria-label="Table"><Icon name="table" /></ToolbarButton>
    </Toolbar>
    <span class="log">inserted: {inserted}</span>
  </Specimen>
</SpecimenGrid>

<style>
  .sep { width: 1px; height: 1.25rem; margin: 0 var(--ds-space-sm); background: var(--ds-color-border); }
  .log { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
