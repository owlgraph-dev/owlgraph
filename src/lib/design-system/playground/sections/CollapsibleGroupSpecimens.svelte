<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import CollapsibleGroup from '../../CollapsibleGroup.svelte';
  import FieldRow from '../../FieldRow.svelte';
  import Switch from '../../Switch.svelte';
  import NumberField from '../../NumberField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let border = $state(true);
  let sticky = $state(false);
  let gap = $state<number | null>(null);
  let padding = $state<number | null>(12);
  let layoutOpen = $state(true);
  let spacingOpen = $state(false);
  let visibilityOpen = $state(true);
</script>

<SpecimenGrid title="States" narrow>
  <Specimen label="open (default)" state="open">
    <CollapsibleGroup title="Layout">
      <FieldRow label="Show border">
        <Switch bind:checked={border} ariaLabel="Show border" />
      </FieldRow>
    </CollapsibleGroup>
  </Specimen>
  <Specimen label="closed" state="closed">
    <CollapsibleGroup title="Spacing" open={false}>
      <FieldRow label="Gap" hint="default 8 px">
        <NumberField size="sm" value={gap} onValueChange={(v) => (gap = v)} unit="px" placeholder="8" min={0} max={64} ariaLabel="Gap" />
      </FieldRow>
    </CollapsibleGroup>
  </Specimen>
  <Specimen label="modified dot (modifiedTitle)" state="modified">
    <CollapsibleGroup title="Spacing" modified modifiedTitle="Differs from the default">
      <FieldRow label="Padding" hint="default 8 px">
        <NumberField size="sm" value={padding} onValueChange={(v) => (padding = v)} unit="px" placeholder="8" min={0} max={64} ariaLabel="Padding" />
      </FieldRow>
    </CollapsibleGroup>
  </Specimen>
  <Specimen label="long title truncates" state="long-title">
    <CollapsibleGroup title="A section title far too long for the block settings column">
      <FieldRow label="Sticky">
        <Switch bind:checked={sticky} ariaLabel="Sticky" />
      </FieldRow>
    </CollapsibleGroup>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Stacked column (the block settings panel)" narrow>
  <Specimen label="three sections, hairline between" state="stack">
    <div class="column">
      <CollapsibleGroup title="Layout" bind:open={layoutOpen}>
        <FieldRow label="Show border">
          <Switch bind:checked={border} ariaLabel="Show border" />
        </FieldRow>
        <FieldRow label="Sticky" info="Keeps the block pinned while its section scrolls.">
          <Switch bind:checked={sticky} ariaLabel="Sticky" />
        </FieldRow>
      </CollapsibleGroup>
      <CollapsibleGroup title="Spacing" bind:open={spacingOpen} modified modifiedTitle="Differs from the default">
        <FieldRow label="Gap" hint="default 8 px">
          <NumberField size="sm" value={gap} onValueChange={(v) => (gap = v)} unit="px" placeholder="8" min={0} max={64} ariaLabel="Gap" />
        </FieldRow>
        <FieldRow label="Padding" hint="all sides">
          <NumberField size="sm" value={padding} onValueChange={(v) => (padding = v)} unit="px" placeholder="8" min={0} max={64} ariaLabel="Padding" />
        </FieldRow>
      </CollapsibleGroup>
      <CollapsibleGroup title="Visibility" bind:open={visibilityOpen}>
        <FieldRow label="Hide on phone">
          <Switch checked={false} ariaLabel="Hide on phone" />
        </FieldRow>
      </CollapsibleGroup>
    </div>
  </Specimen>
</SpecimenGrid>

<style>
  .column { display: flex; flex-direction: column; width: 100%; min-width: 0; }
</style>
