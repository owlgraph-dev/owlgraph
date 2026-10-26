<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Button from '../../Button.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const variants = ['primary', 'secondary', 'ghost', 'danger', 'ghost-danger'] as const;
  const sizes = ['sm', 'md', 'lg'] as const;
  let busy = $state(false);
</script>

<style>
  .running { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>

<SpecimenGrid title="Variants × sizes">
  {#each variants as variant (variant)}
    <Specimen label="variant={variant}" state="variant-{variant}">
      {#each sizes as size (size)}
        <Button {variant} {size}>Save changes</Button>
      {/each}
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="States">
  <Specimen label="disabled" state="disabled">
    <Button variant="primary" disabled>Save changes</Button>
    <Button disabled>Cancel</Button>
    <Button variant="ghost" disabled>Reset</Button>
  </Specimen>
  <Specimen label="loading (spinner over the hidden label; width kept; aria-busy, not dimmed)" state="loading">
    <Button variant="primary" loading>Save changes</Button>
    <Button loading>Upload</Button>
    <Button variant="ghost" size="sm" loading>Replace</Button>
    <Button variant="danger" size="lg" loading>Delete page</Button>
  </Specimen>
  <Specimen label="loading toggle (the width does not jump)" state="loading-toggle">
    <Button variant="primary" loading={busy} onclick={() => { busy = true; setTimeout(() => (busy = false), 1500); }}>Save changes</Button>
  </Specimen>
  <Specimen label="pressed: hold the mouse down on any button (one step deeper than hover)" state="pressed">
    <Button variant="primary">Primary</Button>
    <Button>Secondary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="danger">Danger</Button>
    <Button variant="ghost-danger">Ghost danger</Button>
  </Specimen>
  <Specimen label="active (pressed / panel open)" state="active">
    <Button variant="ghost" active>Filters</Button>
    <Button variant="ghost" icon active title="Sidebar" aria-label="Sidebar"><Icon name="sidebar" /></Button>
  </Specimen>
  <Specimen label="variant=link (a text action under a field or in running text)" state="variant-link" wide>
    <p class="running">No page picked yet. <Button variant="link" size="sm">Use a URL instead</Button></p>
    <Button variant="link">Pick a page</Button>
  </Specimen>
  <Specimen label="href (renders an anchor)" state="link">
    <Button href="/dev/design-system?section=button">Open</Button>
    <Button href="/dev/design-system?section=button" variant="primary">Open</Button>
  </Specimen>
  <Specimen label="type=submit" state="submit">
    <Button type="submit" variant="primary">Submit</Button>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Icon buttons (title + aria-label carry the name)">
  {#each sizes as size (size)}
    <Specimen label="icon size={size}" state="icon-{size}">
      <Button icon {size} variant="ghost" title="Edit" aria-label="Edit"><Icon name="pencil" /></Button>
      <Button icon {size} variant="ghost-danger" title="Delete" aria-label="Delete"><Icon name="trash" /></Button>
      <Button icon {size} title="Add" aria-label="Add"><Icon name="plus" /></Button>
      <Button icon {size} variant="primary" title="Confirm" aria-label="Confirm"><Icon name="check" /></Button>
    </Specimen>
  {/each}
  <Specimen label="icon + label" state="icon-label">
    <Button variant="primary"><Icon name="plus" /> Add property</Button>
    <Button variant="ghost"><Icon name="arrow-left" /> Back</Button>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Grammar">
  <Specimen label="row actions (settings table)" state="row-actions">
    <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit"><Icon name="pencil" /></Button>
    <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete"><Icon name="trash" /></Button>
  </Specimen>
  <Specimen label="dialog footer (cancel + primary)" state="dialog-footer">
    <Button>Cancel</Button>
    <Button variant="primary">Save</Button>
  </Specimen>
  <Specimen label="confirm step (filled danger, once)" state="confirm">
    <Button>Cancel</Button>
    <Button variant="danger">Delete page</Button>
  </Specimen>
  <Specimen label="long label (never wraps)" state="long-label">
    <Button variant="primary">Regenerate all derived values</Button>
  </Specimen>
</SpecimenGrid>
