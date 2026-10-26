<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import FieldRow from '../../FieldRow.svelte';
  import InfoTip from '../../InfoTip.svelte';
  import Switch from '../../Switch.svelte';
  import NumberField from '../../NumberField.svelte';
  import Input from '../../Input.svelte';
  import Button from '../../Button.svelte';
  import Icon from '../../Icon.svelte';
  import SegmentedControl from '../../SegmentedControl.svelte';
  import SegmentedControlItem from '../../SegmentedControlItem.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let on = $state(true);
  let gap = $state<number | null>(null);
  let title = $state('');
  let align = $state('start');
</script>

<SpecimenGrid title="Inline layout (controls up to ~120px)" narrow>
  <Specimen label="switch" state="inline-switch">
    <FieldRow label="Show border">
      <Switch bind:checked={on} ariaLabel="Show border" />
    </FieldRow>
  </Specimen>
  <Specimen label="number field, hint = resolved default" state="inline-number">
    <FieldRow label="Gap" hint="default 8 px" for="pg-fr-gap">
      <NumberField size="sm" id="pg-fr-gap" value={gap} onValueChange={(v) => (gap = v)} unit="px" placeholder="8" min={0} max={64} ariaLabel="Gap" />
    </FieldRow>
  </Specimen>
  <Specimen label="info (ⓘ tooltip)" state="inline-info">
    <FieldRow label="Sticky" info="Keeps the block pinned while its section scrolls.">
      <Switch checked={false} ariaLabel="Sticky" />
    </FieldRow>
  </Specimen>
  <Specimen label="trailing action" state="inline-trailing">
    <FieldRow label="Padding" hint="all sides">
      {#snippet trailing()}
        <Button icon size="sm" variant="ghost" title="Per side" aria-label="Per side"><Icon name="more" /></Button>
      {/snippet}
      <NumberField size="sm" value={12} onValueChange={() => {}} unit="px" ariaLabel="Padding" />
    </FieldRow>
  </Specimen>
  <Specimen label="long label truncates" state="inline-long">
    <FieldRow label="A label far too long for the column it sits in" hint="and a hint">
      <Switch checked={true} ariaLabel="Long" />
    </FieldRow>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Stack layout (wide controls)" narrow>
  <Specimen label="text input" state="stack-input">
    <FieldRow label="Title" layout="stack" for="pg-fr-title">
      <Input id="pg-fr-title" size="sm" bind:value={title} placeholder="Untitled" />
    </FieldRow>
  </Specimen>
  <Specimen label="segmented control, stretch" state="stack-segmented">
    <FieldRow label="Alignment" layout="stack">
      <!-- `value` is one-way; the item's own onclick changes it, as for every consumer. -->
      <SegmentedControl type="single" value={align} size="sm" stretch ariaLabel="Alignment">
        {#each ['start', 'center', 'end', 'stretch'] as v (v)}
          <SegmentedControlItem value={v} onclick={() => (align = v)}>{v[0].toUpperCase() + v.slice(1)}</SegmentedControlItem>
        {/each}
      </SegmentedControl>
    </FieldRow>
  </Specimen>
  <Specimen label="error (the control reads it: aria-invalid, danger border, described)" state="stack-error">
    <FieldRow label="Target" layout="stack" error="Enter a full URL, e.g. https://example.com.">
      <Input size="sm" value="example" aria-label="Target" />
    </FieldRow>
  </Specimen>
  <Specimen label="error on an inline row (spans the row)" state="inline-error">
    <FieldRow label="Columns" error="At most 12.">
      <NumberField size="sm" value={16} onValueChange={() => {}} ariaLabel="Columns" />
    </FieldRow>
  </Specimen>
  <Specimen label="warning (allowed, worth knowing: described, not invalid)" state="inline-warning">
    <FieldRow label="Background" warning="Neither default text colour reads on this background. Set a text colour.">
      <Button size="sm">Grey</Button>
    </FieldRow>
  </Specimen>
  <Specimen label="button row" state="stack-buttons">
    <FieldRow label="Image" layout="stack">
      <div class="row">
        <Button size="sm">Replace</Button>
        <Button size="sm" variant="ghost-danger">Remove</Button>
      </div>
    </FieldRow>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="InfoTip on its own">
  <Specimen label="text" state="infotip">
    <span>Visibility</span>
    <InfoTip text="Who can see this page. Inherited from the namespace unless set here." />
  </Specimen>
</SpecimenGrid>

<style>
  .row { display: flex; gap: var(--ds-space-sm); }
</style>
