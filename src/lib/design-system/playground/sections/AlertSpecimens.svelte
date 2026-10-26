<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Alert from '../../Alert.svelte';
  import Button from '../../Button.svelte';
  import Input from '../../Input.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const tones = ['danger', 'warning', 'info', 'success'] as const;
  const lead = { danger: 'Could not save.', warning: 'Heads up.', info: 'Note.', success: 'Saved.' } as const;
  const text = {
    danger: 'The slug is already taken in this namespace.',
    warning: 'Two properties map to the same field; the manual value wins.',
    info: 'Two conditions use operators this editor cannot show yet.',
    success: 'The share link was created. Copy it now; it is shown only once.',
  } as const;

  let removed = $state(false);
  let name = $state('Knowledge base');
</script>

<SpecimenGrid title="Tones (role=alert for danger, role=status for the rest)">
  {#each tones as tone (tone)}
    <Specimen label="tone={tone}" state="tone-{tone}">
      <Alert {tone}>{text[tone]}</Alert>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Content">
  <Specimen label="title (a bold lead-in)" state="title">
    <Alert tone="danger" title={lead.danger}>{text.danger}</Alert>
  </Specimen>
  <Specimen label="long message wraps; glyph stays on the first line" state="long">
    <Alert tone="warning">This page is published under a class whose required fields are not all filled in. Readers will see empty values until an editor completes them, and queries that filter on those fields will skip the page.</Alert>
  </Specimen>
  <Specimen label="actions snippet (Button size=sm)" state="actions">
    {#if !removed}
      <Alert tone="warning">
        {text.warning}
        {#snippet actions()}
          <Button size="sm" variant="ghost" onclick={() => (removed = true)}>Remove</Button>
        {/snippet}
      </Alert>
    {:else}
      <Button size="sm" onclick={() => (removed = false)}>Show again</Button>
    {/if}
  </Specimen>
  <Specimen label="richer content (a success reveal with a control)" state="rich">
    <Alert tone="success">
      {text.success}
      {#snippet actions()}
        <Button size="sm">Copy</Button>
      {/snippet}
    </Alert>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Layout">
  <Specimen label="layout=banner (flush, full width, tops a surface)" state="banner" wide>
    <div class="frame">
      <Alert tone="danger" layout="banner">Your edit lock was taken over, so this page is now read-only. Your unsaved changes are still shown below.</Alert>
      <p class="frame-body">Editor content…</p>
    </div>
  </Specimen>
  <Specimen label="inside a form, above the footer" state="form" wide>
    <form class="form" onsubmit={(e) => e.preventDefault()}>
      <label class="lbl">Name<Input bind:value={name} aria-invalid="true" /></label>
      <Alert tone="danger">A property group with this name already exists.</Alert>
    </form>
  </Specimen>
</SpecimenGrid>

<style>
  .frame { border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); overflow: hidden; }
  .frame-body { margin: 0; padding: var(--ds-space-md); color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .form { display: flex; flex-direction: column; gap: var(--ds-space-sm); max-width: 28rem; }
  .lbl { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
