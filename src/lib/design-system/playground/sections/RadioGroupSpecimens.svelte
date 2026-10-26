<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import RadioGroup from '../../RadioGroup.svelte';
  import FormField from '../../FormField.svelte';
  import Input from '../../Input.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const targets = [
    { value: 'page', label: 'Page' },
    { value: 'url', label: 'External URL' },
  ];
  let target = $state('page');
  let density = $state('comfortable');
  let plan = $state('free');
</script>

<SpecimenGrid title="Layouts">
  <Specimen label="horizontal (default), inside a FormField group: named by the label" state="horizontal" wide>
    <FormField label="Links to" group>
      <RadioGroup items={targets} bind:value={target} />
    </FormField>
    {#if target === 'url'}
      <FormField label="URL"><Input placeholder="https://" /></FormField>
    {/if}
  </Specimen>
  <Specimen label="vertical, ariaLabel (no FormField)" state="vertical">
    <RadioGroup
      orientation="vertical"
      ariaLabel="Density"
      items={[
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'spacious', label: 'Spacious' },
      ]}
      bind:value={density}
    />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="size=sm" state="sm">
    <RadioGroup size="sm" ariaLabel="Link target" items={targets} value="url" />
  </Specimen>
  <Specimen label="one option disabled" state="item-disabled">
    <RadioGroup
      ariaLabel="Plan"
      items={[
        { value: 'free', label: 'Free' },
        { value: 'team', label: 'Team' },
        { value: 'enterprise', label: 'Enterprise', disabled: true },
      ]}
      bind:value={plan}
    />
  </Specimen>
  <Specimen label="whole group disabled" state="disabled">
    <RadioGroup disabled ariaLabel="Link target" items={targets} value="page" />
  </Specimen>
</SpecimenGrid>
