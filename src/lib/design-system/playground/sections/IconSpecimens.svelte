<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Icon from '../../Icon.svelte';
  import { BLOCK_GLYPH_NAMES, QUICK_LINK_ICON_NAMES, glyphSvg, iconSvg } from '../../icons';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  // Keep in step with Icon.svelte's `name === '...'` branches: it exports no list.
  const CHROME_ICON_NAMES = [
    'bold', 'italic', 'code', 'heading', 'list', 'list-ordered', 'link', 'external-link', 'trash', 'plus', 'check',
    'chevron', 'arrow-left', 'eye', 'pencil', 'sidebar', 'x', 'braces', 'type', 'info', 'alert-circle', 'alert-triangle', 'table',
    'diagram', 'home', 'folder', 'refresh', 'search', 'user', 'image', 'file', 'file-text', 'layers', 'graph', 'sliders', 'sun', 'moon', 'monitor', 'tablet',
    'phone', 'menu', 'more', 'settings', 'log-out', 'lock', 'tag', 'wrap-off', 'wrap-on', 'wrap-reverse', 'wrap-scroll',
    'grip', 'corner-up-left', 'chevron-up', 'chevron-left', 'chevron-right', 'arrow-up-down', 'layout-grid', 'arrow-up', 'column-plus', 'column-minus', 'row-plus', 'row-minus',
    'cell-plus', 'cell-minus', 'flex-row', 'flex-column', 'select-cells', 'table-header',
    'width-read', 'width-wide', 'width-full', 'arrow-right', 'section-up', 'section-down', 'section-extract',
    'align-start', 'align-center', 'align-end', 'align-stretch', 'download', 'expand',
  ] as const;
</script>

<SpecimenGrid title="Icon — every chrome glyph at size 18 (default)">
  <Specimen label="all {CHROME_ICON_NAMES.length} glyphs" state="chrome-18" wide>
    <ul class="glyphs">
      {#each CHROME_ICON_NAMES as name (name)}
        <li class="glyph">
          <span class="glyph-box"><Icon {name} /></span>
          <span class="glyph-name">{name}</span>
        </li>
      {/each}
    </ul>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Icon — sizes">
  <Specimen label="size=24" state="chrome-24" wide>
    <ul class="glyphs glyphs-row">
      {#each CHROME_ICON_NAMES as name (name)}
        <li class="glyph">
          <span class="glyph-box glyph-box-lg"><Icon {name} size={24} /></span>
        </li>
      {/each}
    </ul>
  </Specimen>
  <Specimen label="size 14 / 18 / 24 beside text" state="sizes-inline">
    <span class="inline"><Icon name="pencil" size={14} /> 14</span>
    <span class="inline"><Icon name="pencil" size={18} /> 18</span>
    <span class="inline"><Icon name="pencil" size={24} /> 24</span>
  </Specimen>
  <Specimen label="stroke = currentColor (muted, accent, danger)" state="current-color">
    <span class="tone-muted"><Icon name="info" /></span>
    <span class="tone-accent"><Icon name="check" /></span>
    <span class="tone-danger"><Icon name="trash" /></span>
  </Specimen>
  <Specimen label="unknown name renders an empty svg" state="unknown">
    <span class="glyph-box"><Icon name="does-not-exist" /></span>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Quick-link icons (icons.ts, iconSvg via @html)">
  <Specimen label="all {QUICK_LINK_ICON_NAMES.length} quick-link icons at size 18" state="reference-18" wide>
    <ul class="glyphs">
      {#each QUICK_LINK_ICON_NAMES as name (name)}
        <li class="glyph">
          <span class="glyph-box">{@html iconSvg(name, 18)}</span>
          <span class="glyph-name">{name}</span>
        </li>
      {/each}
    </ul>
  </Specimen>
  <Specimen label="iconSvg at size 24" state="reference-24" wide>
    <ul class="glyphs glyphs-row">
      {#each QUICK_LINK_ICON_NAMES as name (name)}
        <li class="glyph">
          <span class="glyph-box glyph-box-lg">{@html iconSvg(name, 24)}</span>
        </li>
      {/each}
    </ul>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Block glyphs (icons.ts BLOCK_GLYPHS, glyphSvg via @html — never offered in the icon picker)">
  <Specimen label="all {BLOCK_GLYPH_NAMES.length} block glyphs at size 18" state="block-glyphs" wide>
    <ul class="glyphs">
      {#each BLOCK_GLYPH_NAMES as name (name)}
        <li class="glyph">
          <span class="glyph-box">{@html glyphSvg(name, 18)}</span>
          <span class="glyph-name">{name}</span>
        </li>
      {/each}
    </ul>
  </Specimen>
</SpecimenGrid>

<style>
  .glyphs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    gap: var(--ds-space-sm);
  }
  .glyphs-row { display: flex; flex-wrap: wrap; }
  .glyph {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ds-space-sm);
    min-width: 0;
  }
  .glyph-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    color: var(--ds-color-fg);
  }
  .glyph-box-lg { width: 2.75rem; height: 2.75rem; }
  .glyph-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .inline { display: inline-flex; align-items: center; gap: var(--ds-space-sm); font-family: var(--ds-font-mono); font-size: var(--ds-text-sm); color: var(--ds-color-fg); }
  .tone-muted { display: inline-flex; color: var(--ds-color-muted); }
  .tone-accent { display: inline-flex; color: var(--ds-color-accent); }
  .tone-danger { display: inline-flex; color: var(--ds-color-danger); }
</style>
