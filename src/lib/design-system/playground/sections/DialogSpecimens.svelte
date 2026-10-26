<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Dialog from '../../Dialog.svelte';
  import BottomSheet from '../../BottomSheet.svelte';
  import BottomSheetItem from '../../BottomSheetItem.svelte';
  import Icon from '../../Icon.svelte';
  import Button from '../../Button.svelte';
  import Input from '../../Input.svelte';
  import Select from '../../Select.svelte';
  import Badge from '../../Badge.svelte';
  import Specimen from '../Specimen.svelte';
  import SheetPageDemo from './SheetPageDemo.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const sizes = ['sm', 'md', 'lg', 'xl'] as const;
  type Size = (typeof sizes)[number];

  let sizeOpen = $state<Record<Size, boolean>>({ sm: false, md: false, lg: false, xl: false });
  let dangerOpen = $state(false);
  let descriptionOpen = $state(false);
  let longOpen = $state(false);
  let fillOpen = $state(false);
  let fillFilter = $state('');
  let formOpen = $state(false);
  let sheetOpen = $state(false);
  let footerSheetOpen = $state(false);
  let tallSheetOpen = $state(false);
  let pageSheetOpen = $state(false);
  let pageSheetName = $state('');

  const formId = 'pg-dialog-form';
  const kinds = [
    { value: 'page', label: 'Page' },
    { value: 'document', label: 'Document' },
    { value: 'redirect', label: 'Redirect' },
  ];
  let name = $state('');
  let kind = $state('page');
  let created = $state('nothing yet');

  function submitForm(e: SubmitEvent) {
    e.preventDefault();
    created = `${name.trim() || 'Untitled'} (${kind})`;
    formOpen = false;
  }
</script>

<SpecimenGrid title="Sizes">
  {#each sizes as size (size)}
    <Specimen label="size={size}" state="size-{size}" overlay>
      <Button onclick={() => (sizeOpen[size] = true)}>Open {size}</Button>
      <Dialog bind:open={sizeOpen[size]} {size} title="Dialog size {size}">
        <p class="body">The body sits between the title and the footer. Width is fixed per size; height follows content until the viewport bound.</p>
        {#snippet footer()}
          <Button onclick={() => (sizeOpen[size] = false)}>Cancel</Button>
          <Button variant="primary" onclick={() => (sizeOpen[size] = false)}>Save</Button>
        {/snippet}
      </Dialog>
    </Specimen>
  {/each}
</SpecimenGrid>

<SpecimenGrid title="Variants and content">
  <Specimen label="variant=danger (confirm: Cancel + filled danger)" state="danger" overlay>
    <Button variant="ghost-danger" onclick={() => (dangerOpen = true)}>Delete page</Button>
    <Dialog bind:open={dangerOpen} variant="danger" size="sm" title="Delete page?">
      <p class="body">“Getting started” and its revisions are removed for everyone.</p>
      {#snippet footer()}
        <Button onclick={() => (dangerOpen = false)}>Cancel</Button>
        <Button variant="danger" onclick={() => (dangerOpen = false)}>Delete page</Button>
      {/snippet}
    </Dialog>
  </Specimen>
  <Specimen label="with description" state="description" overlay>
    <Button onclick={() => (descriptionOpen = true)}>Regenerate index</Button>
    <Dialog bind:open={descriptionOpen} title="Regenerate search index" description="Rebuilds every derived search document. Existing content is not changed.">
      <p class="body">This can take a few minutes on a large namespace.</p>
      {#snippet footer()}
        <Button onclick={() => (descriptionOpen = false)}>Cancel</Button>
        <Button variant="primary" onclick={() => (descriptionOpen = false)}>Start</Button>
      {/snippet}
    </Dialog>
  </Specimen>
  <Specimen label="long body (bounded height, body scrolls, footer stays)" state="long-body" overlay>
    <Button onclick={() => (longOpen = true)}>Open changelog</Button>
    <Dialog bind:open={longOpen} title="Release notes">
      {#each { length: 30 } as _, i (i)}
        <p class="body">Entry {i + 1}: a paragraph long enough to wrap onto a second line so thirty of them overflow the viewport comfortably.</p>
      {/each}
      <!-- A scrolling body needs focusable content to be keyboard-reachable;
           this stands in for a real long dialog's form controls. -->
      <Button size="sm" onclick={() => (longOpen = false)}>Copy notes</Button>
      {#snippet footer()}
        <Button variant="primary" onclick={() => (longOpen = false)}>Done</Button>
      {/snippet}
    </Dialog>
  </Specimen>
  <Specimen label="body=fill (the body never scrolls; its child keeps a head in place and scrolls its own list)" state="body-fill" overlay>
    <Button onclick={() => (fillOpen = true)}>Open entries</Button>
    <Dialog bind:open={fillOpen} body="fill" size="lg" title="Entries">
      <div class="fill">
        <div class="fill-head"><Input bind:value={fillFilter} placeholder="Filter entries" aria-label="Filter entries" /></div>
        <div class="fill-scroll">
          {#each { length: 30 } as _, i (i)}
            <p class="body">Entry {i + 1}{fillFilter ? ` — matching “${fillFilter}”` : ''}: the head above stays in view while this list scrolls.</p>
          {/each}
          <!-- Focusable, so the scrolling region is keyboard-reachable. -->
          <Button size="sm" onclick={() => (fillOpen = false)}>Copy entries</Button>
        </div>
      </div>
      {#snippet footer()}
        <Button variant="primary" onclick={() => (fillOpen = false)}>Done</Button>
      {/snippet}
    </Dialog>
  </Specimen>
  <Specimen label="form inside; footer buttons use the form attribute" state="form" overlay>
    <Button variant="primary" onclick={() => (formOpen = true)}>New entry</Button>
    <span class="log">created: {created}</span>
    <Dialog bind:open={formOpen} title="New entry">
      <form id={formId} class="form" onsubmit={submitForm}>
        <label class="lbl">Name<Input bind:value={name} placeholder="Untitled" /></label>
        <label class="lbl">Kind<Select items={kinds} bind:value={kind} width="full" ariaLabel="Kind" /></label>
      </form>
      {#snippet footer()}
        <Button type="button" onclick={() => (formOpen = false)}>Cancel</Button>
        <Button type="submit" form={formId} variant="primary">Create</Button>
      {/snippet}
    </Dialog>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="BottomSheet (phone shape of the same modal)">
  <Specimen label="title + a menu of BottomSheetItems (link, current, disclosure, danger); slides up from the bottom edge" state="bottom-sheet" overlay>
    <Button onclick={() => (sheetOpen = true)}>Open sheet</Button>
    <BottomSheet bind:open={sheetOpen} title="Menu">
      <div class="stack-flush">
        <BottomSheetItem href="/dev/design-system?section=dialog" active>Design system</BottomSheetItem>
        <BottomSheetItem onclick={() => (sheetOpen = false)}><Icon name="user" size={16} />Profile</BottomSheetItem>
        <BottomSheetItem aria-expanded={false}>
          Handbook
          {#snippet trailing()}<Icon name="chevron" size={16} />{/snippet}
        </BottomSheetItem>
        <BottomSheetItem variant="danger" onclick={() => (sheetOpen = false)}><Icon name="log-out" size={16} />Sign out</BottomSheetItem>
      </div>
    </BottomSheet>
  </Specimen>
  <Specimen label="footer: actions below the scrolling body, always in view (a filter sheet's Reset and Show results)" state="bottom-sheet-footer" overlay>
    <Button onclick={() => (footerSheetOpen = true)}>Open filter sheet</Button>
    <BottomSheet bind:open={footerSheetOpen} title="Filter">
      <p class="body">The filters go here; the body scrolls when they are taller than the sheet, and the footer stays put.</p>
      {#snippet footer()}
        <Button onclick={() => (footerSheetOpen = false)}>Reset</Button>
        <Button variant="primary" class="sheet-apply" onclick={() => (footerSheetOpen = false)}>Show 24 results</Button>
      {/snippet}
    </BottomSheet>
  </Specimen>
  <Specimen label="size=lg + closeLabel + actions: a long settings panel — all of the screen but a strip of backdrop, a close button and a count in the header that never scroll away" state="bottom-sheet-tall" overlay>
    <Button onclick={() => (tallSheetOpen = true)}>Open settings sheet</Button>
    <BottomSheet bind:open={tallSheetOpen} title="Display options" size="lg" closeLabel="Close">
      {#snippet actions()}<Badge tone="accent">Filter · 2</Badge>{/snippet}
      {#each ['View', 'Filter', 'Display', 'Forces'] as section (section)}
        <p class="body"><strong>{section}</strong> — the settings of this section; the body scrolls under the header when they are taller than the sheet.</p>
      {/each}
    </BottomSheet>
  </Specimen>
  <Specimen label="a page of the sheet: a part of its content (a picker) shows a page in its place, Back and Escape return to it as it was" state="bottom-sheet-page" overlay>
    <Button onclick={() => (pageSheetOpen = true)}>Open sheet with a page</Button>
    <BottomSheet bind:open={pageSheetOpen} title="Settings" size="lg" closeLabel="Close">
      <label class="lbl">Name<Input bind:value={pageSheetName} placeholder="Untitled" /></label>
      <SheetPageDemo />
    </BottomSheet>
  </Specimen>
</SpecimenGrid>

<style>
  /* The primary action takes the rest of the footer's row. */
  :global(.sheet-apply) { flex: 1 1 auto; }
  .body { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-md); color: var(--ds-color-fg); line-height: 1.5; }
  .body:last-child { margin-bottom: 0; }
  .form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .lbl { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .stack-flush { display: flex; flex-direction: column; }
  /* Shrinks to the body (min-height: 0), so only its list scrolls. */
  .fill { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .fill-head { flex: none; }
  .fill-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .log { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
