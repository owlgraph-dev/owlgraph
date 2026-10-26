<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // docs/architecture/design-system/overview.md, "Playground". Hover and focus are never rendered
  // statically: faking the ring would be a second ring implementation.
  import { SECTIONS } from './sections';
  import SegmentedControl from '../SegmentedControl.svelte';
  import SegmentedControlItem from '../SegmentedControlItem.svelte';

  let {
    section = null,
    scheme = 'light',
    onSchemeChange,
  }: {
    section?: string | null;
    /** The colour scheme every specimen renders in. */
    scheme?: 'light' | 'dark';
    onSchemeChange?: (scheme: 'light' | 'dark') => void;
  } = $props();

  const visible = $derived(section ? SECTIONS.filter((s) => s.id === section) : SECTIONS);
  const hrefFor = (id: string | null) => {
    const params = new URLSearchParams();
    if (id) params.set('section', id);
    if (scheme === 'dark') params.set('scheme', 'dark');
    const query = params.toString();
    return `/dev/design-system${query ? `?${query}` : ''}`;
  };

  // On <body>, where floating layers portal to; for light too, since the
  // viewer's preference may make the document dark.
  $effect(() => {
    document.body.dataset.scheme = scheme;
    return () => {
      delete document.body.dataset.scheme;
    };
  });
</script>

<div class="pg">
  <aside class="pg-nav">
    <h1 class="pg-title">Design system</h1>
    <p class="pg-lead">
      Every primitive in every state. Reference: <code>docs/architecture/design-system/</code>.
      Hover, pressed and focus are live — Tab through the page, nothing simulates the ring.
    </p>
    <div class="pg-scheme">
      <SegmentedControl type="single" size="sm" stretch value={scheme} ariaLabel="Colour scheme">
        <SegmentedControlItem value="light" onclick={() => onSchemeChange?.('light')}>Light</SegmentedControlItem>
        <SegmentedControlItem value="dark" onclick={() => onSchemeChange?.('dark')}>Dark</SegmentedControlItem>
      </SegmentedControl>
    </div>
    <nav aria-label="Sections">
      <ul class="pg-toc">
        <li><a href={hrefFor(null)} aria-current={section ? undefined : 'page'}>All sections</a></li>
        {#each SECTIONS as s (s.id)}
          <li>
            <a href={hrefFor(s.id)} aria-current={section === s.id ? 'page' : undefined}>{s.title}</a>
          </li>
        {/each}
      </ul>
    </nav>
  </aside>

  <div class="pg-main">
    {#if visible.length === 0}
      <p class="pg-empty">No section named "{section}". <a href={hrefFor(null)}>All sections</a></p>
    {/if}
    {#each visible as s (s.id)}
      <section class="pg-section" id={s.id} data-playground={s.id}>
        <header class="pg-section-head">
          <h2 class="pg-section-title">{s.title}</h2>
          <p class="pg-section-note">{s.note}</p>
          <p class="pg-section-docs">Rationale: <code>{s.docs}</code></p>
        </header>
        <s.component />
      </section>
    {/each}
  </div>
</div>

<style>
  .pg {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    gap: var(--ds-space-lg);
    padding: var(--ds-space-lg);
    font-family: var(--ds-font-sans);
    color: var(--ds-color-fg);
  }
  /* Sticky against the document, below the fixed app bar (app.css). */
  .pg-nav {
    position: sticky;
    top: calc(var(--appbar-top-inset) + var(--ds-space-lg));
    align-self: start;
    max-height: calc(100vh - var(--appbar-top-inset) - var(--appbar-bottom-inset) - 2 * var(--ds-space-lg));
    overflow-y: auto;
  }
  .pg-title { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); }
  .pg-lead { margin: 0 0 var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .pg-scheme { margin: 0 0 var(--ds-space-md); }
  .pg-toc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .pg-toc a {
    display: block;
    padding: 0.25rem var(--ds-space-sm);
    border-radius: var(--ds-radius-sm);
    color: var(--ds-color-fg);
    text-decoration: none;
    font-size: var(--ds-text-sm);
  }
  .pg-toc a:hover { background: var(--ds-color-well); }
  .pg-toc a[aria-current='page'] { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }

  .pg-main { min-width: 0; display: flex; flex-direction: column; gap: var(--ds-space-lg); }
  .pg-section {
    padding: 0 0 var(--ds-space-lg);
    border-bottom: 1px solid var(--ds-color-border);
    min-width: 0;
  }
  .pg-section:last-child { border-bottom: none; }
  .pg-section-head { margin: 0 0 var(--ds-space-md); }
  .pg-section-title { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-lg); font-weight: var(--ds-weight-semibold); }
  .pg-section-note { margin: 0 0 0.25rem; max-width: 70ch; font-size: var(--ds-text-md); }
  .pg-section-docs { margin: 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .pg-empty { color: var(--ds-color-muted); }
  code { font-family: var(--ds-font-mono); font-size: 0.92em; }

  @media (max-width: 768px) {
    .pg { grid-template-columns: minmax(0, 1fr); padding: var(--ds-space-md); }
    .pg-nav { position: static; max-height: none; }
  }
</style>
