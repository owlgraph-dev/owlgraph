<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import SegmentedControl from '../../SegmentedControl.svelte';
  import SegmentedControlItem from '../../SegmentedControlItem.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // `value` is one-way on the group; each item's onclick changes it.
  let view = $state('list');
  let align = $state('start');
  let width = $state('auto');
  let marks = $state<string[]>(['bold']);
  let sizeSm = $state('start');
  let sizeMd = $state('start');
  let stretched = $state('center');
  let viewport = $state('desktop');
  let iconMarks = $state<string[]>(['italic']);
  let named = $state('a');

  const alignments = ['start', 'center', 'end'] as const;
  const viewports = [
    { key: 'desktop', icon: 'monitor', title: 'Desktop' },
    { key: 'tablet', icon: 'tablet', title: 'Tablet' },
    { key: 'phone', icon: 'phone', title: 'Phone' },
  ] as const;

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }
</script>

<SpecimenGrid title="type=single">
  <Specimen label="2 items" state="single-2">
    <SegmentedControl type="single" value={view} ariaLabel="View">
      <SegmentedControlItem value="list" onclick={() => (view = 'list')}>List</SegmentedControlItem>
      <SegmentedControlItem value="grid" onclick={() => (view = 'grid')}>Grid</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
  <Specimen label="3 items" state="single-3">
    <SegmentedControl type="single" value={align} ariaLabel="Alignment">
      {#each alignments as a (a)}
        <SegmentedControlItem value={a} onclick={() => (align = a)}>{a[0].toUpperCase() + a.slice(1)}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </Specimen>
  <Specimen label="4 items" state="single-4">
    <SegmentedControl type="single" value={width} ariaLabel="Width">
      <SegmentedControlItem value="auto" onclick={() => (width = 'auto')}>Auto</SegmentedControlItem>
      <SegmentedControlItem value="50" onclick={() => (width = '50')}>50%</SegmentedControlItem>
      <SegmentedControlItem value="75" onclick={() => (width = '75')}>75%</SegmentedControlItem>
      <SegmentedControlItem value="100" onclick={() => (width = '100')}>100%</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="type=multiple">
  <Specimen label="toggles (several may be on)" state="multiple">
    <SegmentedControl type="multiple" value={marks} ariaLabel="Text style">
      <SegmentedControlItem value="bold" onclick={() => (marks = toggle(marks, 'bold'))}>Bold</SegmentedControlItem>
      <SegmentedControlItem value="italic" onclick={() => (marks = toggle(marks, 'italic'))}>Italic</SegmentedControlItem>
      <SegmentedControlItem value="code" onclick={() => (marks = toggle(marks, 'code'))}>Code</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Sizes and stretch" narrow>
  <Specimen label="size=md (default)" state="size-md">
    <SegmentedControl type="single" value={sizeMd} ariaLabel="Alignment">
      {#each alignments as a (a)}
        <SegmentedControlItem value={a} onclick={() => (sizeMd = a)}>{a[0].toUpperCase() + a.slice(1)}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </Specimen>
  <Specimen label="size=sm (block settings rows)" state="size-sm">
    <SegmentedControl type="single" size="sm" value={sizeSm} ariaLabel="Alignment">
      {#each alignments as a (a)}
        <SegmentedControlItem value={a} onclick={() => (sizeSm = a)}>{a[0].toUpperCase() + a.slice(1)}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </Specimen>
  <Specimen label="stretch (fills the row, items share width)" state="stretch">
    <SegmentedControl type="single" size="sm" stretch value={stretched} ariaLabel="Alignment">
      {#each alignments as a (a)}
        <SegmentedControlItem value={a} onclick={() => (stretched = a)}>{a[0].toUpperCase() + a.slice(1)}</SegmentedControlItem>
      {/each}
      <SegmentedControlItem value="stretch" onclick={() => (stretched = 'stretch')}>Stretch</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
  <Specimen label="stretch in a 180px column (labels truncate inside their items; title keeps the full label)" state="stretch-narrow">
    <div class="narrow-column">
      <SegmentedControl type="single" size="sm" stretch value={stretched} ariaLabel="Alignment">
        {#each alignments as a (a)}
          <SegmentedControlItem value={a} title={a} onclick={() => (stretched = a)}>{a[0].toUpperCase() + a.slice(1)}</SegmentedControlItem>
        {/each}
        <SegmentedControlItem value="stretch" title="stretch" onclick={() => (stretched = 'stretch')}>Stretch</SegmentedControlItem>
      </SegmentedControl>
    </div>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="disabled (whole group)" state="disabled">
    <SegmentedControl type="single" value="list" disabled ariaLabel="View">
      <SegmentedControlItem value="list">List</SegmentedControlItem>
      <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
  <Specimen label="one disabled item" state="disabled-item">
    <SegmentedControl type="single" value={named} ariaLabel="Option">
      <SegmentedControlItem value="a" onclick={() => (named = 'a')}>A</SegmentedControlItem>
      <SegmentedControlItem value="b" onclick={() => (named = 'b')}>B</SegmentedControlItem>
      <SegmentedControlItem value="c" disabled>C</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
  <Specimen label="ariaLabel names the group (no visible label)" state="aria-label">
    <SegmentedControl type="single" value={view} ariaLabel="View">
      <SegmentedControlItem value="list" onclick={() => (view = 'list')}>List</SegmentedControlItem>
      <SegmentedControlItem value="grid" onclick={() => (view = 'grid')}>Grid</SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Icon items (title + aria-label on each item)">
  <Specimen label="single, viewport glyphs" state="icons-single">
    <SegmentedControl type="single" size="sm" value={viewport} ariaLabel="Viewport">
      {#each viewports as vp (vp.key)}
        <SegmentedControlItem value={vp.key} onclick={() => (viewport = vp.key)} title={vp.title} aria-label={vp.title}>
          <Icon name={vp.icon} size={15} />
        </SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </Specimen>
  <Specimen label="multiple, mark glyphs" state="icons-multiple">
    <SegmentedControl type="multiple" size="sm" value={iconMarks} ariaLabel="Text style">
      <SegmentedControlItem value="bold" onclick={() => (iconMarks = toggle(iconMarks, 'bold'))} title="Bold" aria-label="Bold">
        <Icon name="bold" size={15} />
      </SegmentedControlItem>
      <SegmentedControlItem value="italic" onclick={() => (iconMarks = toggle(iconMarks, 'italic'))} title="Italic" aria-label="Italic">
        <Icon name="italic" size={15} />
      </SegmentedControlItem>
    </SegmentedControl>
  </Specimen>
</SpecimenGrid>

<style>
  .narrow-column { width: 180px; max-width: 100%; }
</style>
