<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Tabs from '../../Tabs.svelte';
  import TabsTrigger from '../../TabsTrigger.svelte';
  import TabsContent from '../../TabsContent.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let automatic = $state('general');
  let manual = $state('general');
  let withDisabled = $state('general');
  let many = $state('t1');

  const manyTabs = Array.from({ length: 12 }, (_, i) => ({ value: `t${i + 1}`, label: `Section ${i + 1}` }));
</script>

<SpecimenGrid title="In-page panel swap">
  <Specimen label="activationMode=automatic (default): focus activates — value={automatic}" state="automatic" wide>
    <Tabs bind:value={automatic} ariaLabel="Page settings">
      {#snippet tabs()}
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="metadata">Metadata</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      {/snippet}
      <TabsContent value="general"><p class="panel">General settings: title, slug and visibility.</p></TabsContent>
      <TabsContent value="metadata"><p class="panel">Metadata: description, social image and canonical URL.</p></TabsContent>
      <TabsContent value="advanced"><p class="panel">Advanced: custom head markup and redirects.</p></TabsContent>
    </Tabs>
  </Specimen>

  <Specimen label="activationMode=manual: arrow keys move focus, Enter/Space activates — value={manual}" state="manual" wide>
    <Tabs bind:value={manual} activationMode="manual" ariaLabel="Page settings (manual activation)">
      {#snippet tabs()}
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="metadata">Metadata</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      {/snippet}
      <TabsContent value="general"><p class="panel">General settings: title, slug and visibility.</p></TabsContent>
      <TabsContent value="metadata"><p class="panel">Metadata: description, social image and canonical URL.</p></TabsContent>
      <TabsContent value="advanced"><p class="panel">Advanced: custom head markup and redirects.</p></TabsContent>
    </Tabs>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="one disabled trigger" state="disabled" wide>
    <Tabs bind:value={withDisabled} ariaLabel="Page settings with a locked tab">
      {#snippet tabs()}
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="metadata" disabled>Metadata</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      {/snippet}
      <TabsContent value="general"><p class="panel">General settings.</p></TabsContent>
      <TabsContent value="metadata"><p class="panel">Metadata (unreachable while disabled).</p></TabsContent>
      <TabsContent value="advanced"><p class="panel">Advanced settings.</p></TabsContent>
    </Tabs>
  </Specimen>
  <Specimen label="many tabs scroll sideways inside the list, never wrap" state="many" wide>
    <div class="clamp">
      <Tabs bind:value={many} ariaLabel="Many sections">
        {#snippet tabs()}
          {#each manyTabs as t (t.value)}
            <TabsTrigger value={t.value}>{t.label}</TabsTrigger>
          {/each}
        {/snippet}
        {#each manyTabs as t (t.value)}
          <TabsContent value={t.value}><p class="panel">{t.label} content.</p></TabsContent>
        {/each}
      </Tabs>
    </div>
  </Specimen>
  <Specimen label="href triggers (route navigation shape, manual activation)" state="links" wide>
    <Tabs value="tabs" activationMode="manual" ariaLabel="Playground sections">
      {#snippet tabs()}
        <TabsTrigger value="button" href="/dev/design-system?section=button">Button</TabsTrigger>
        <TabsTrigger value="tabs" href="/dev/design-system?section=tabs">Tabs</TabsTrigger>
        <TabsTrigger value="table" href="/dev/design-system?section=table">Table</TabsTrigger>
      {/snippet}
      <TabsContent value="tabs"><p class="panel">The routed page renders inside a single TabsContent for the current value.</p></TabsContent>
    </Tabs>
  </Specimen>
</SpecimenGrid>

<style>
  .panel { margin: var(--ds-space-md) 0 0; font-family: var(--ds-font-sans); font-size: var(--ds-text-md); color: var(--ds-color-fg); }
  .clamp { max-width: 28rem; }
</style>
