<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The named styles on a sample page in either scheme, compiled by the module
  // the server runs, so the preview is the same text a save would serve. The
  // compiler loads on demand (customStyles/load.ts): postcss is heavy and would
  // otherwise ride the components barrel onto every page. The rules stay
  // unchanged: this sample is the only `.page-canvas` in Settings.
  import { SegmentedControl, SegmentedControlItem, EmptyState } from '$lib/design-system';
  import { inLayer } from '$lib/platform/cssLayers';
  import { SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
  import * as m from '$lib/paraglide/messages';
  import { styleClass } from '../customStyles/slug';
  import { loadCustomStyleTools, type CustomStyleTools } from '../customStyles/load';
  import type { CompileSheet } from '../customStyles/compile';
  import type { CustomStyleRow } from '../types';

  let {
    sheet,
    styles,
  }: {
    sheet: { id: string; freeCss: string };
    /** The named styles as they currently stand in the form, drafts included. */
    styles: CustomStyleRow[];
  } = $props();

  let scheme = $state<SchemeName>('light');

  const inline = $derived(styles.filter((style) => style.kind === 'inline'));
  const blocks = $derived(styles.filter((style) => style.kind === 'block'));

  const draft = $derived<CompileSheet>({
    id: sheet.id,
    position: 0,
    enabled: true,
    freeCss: sheet.freeCss,
    styles: styles.map((style, position) => ({ id: style.id, slug: style.slug, kind: style.kind, css: style.css, position })),
  });

  let tools = $state<CustomStyleTools | null>(null);
  $effect(() => {
    void loadCustomStyleTools().then((loaded) => (tools = loaded));
  });

  // Empty until the compiler arrives; a failing style contributes nothing (its
  // field shows the error). In the custom layer, as the served artifact is.
  const css = $derived(tools ? inLayer('custom', tools.compileStylesheets([draft]).css) : '');
</script>

<div class="preview-head">
  <SegmentedControl type="single" size="sm" value={scheme} ariaLabel={m.settings_styles_preview_scheme()}>
    {#each SCHEME_NAMES as name (name)}
      <SegmentedControlItem value={name} onclick={() => (scheme = name)}>
        {name === 'light' ? m.settings_styles_preview_light() : m.settings_styles_preview_dark()}
      </SegmentedControlItem>
    {/each}
  </SegmentedControl>
</div>

{#if css}
  <!-- Every compiled rule is confined to a page canvas, and the sample is the only one here. -->
  {@html `<style>${css}</style>`}
{/if}

<!-- Not a SettingsWell (an asset thumbnail's centred row): a full-width sample brings its own frame. -->
<div class="preview-frame">
  {#if styles.length === 0}
    <EmptyState size="sm">{m.settings_styles_preview_empty()}</EmptyState>
  {:else}
    <article class="page-canvas preview-canvas" data-scheme={scheme}>
      <div class="canvas-blocks preview-blocks">
        <h3>{m.settings_styles_preview_heading()}</h3>
        <p>
          {m.settings_styles_preview_lead()}
          {#each inline as style (style.id)}
            <span class={styleClass(style.slug)}>{style.label || m.settings_styles_preview_sample()}</span>{' '}
          {/each}
        </p>
        {#each blocks as style (style.id)}
          <div class={styleClass(style.slug)}>
            <p>{style.label || m.settings_styles_preview_sample()}</p>
          </div>
        {/each}
      </div>
    </article>
  {/if}
</div>

<style>
  .preview-head { display: flex; justify-content: flex-end; margin-bottom: var(--ds-space-sm); }

  .preview-frame {
    box-sizing: border-box;
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
  }

  /* A real content canvas without its full-page geometry; blocks measure their
     width against the frame. */
  .preview-canvas {
    max-width: none;
    margin: 0;
    --canvas-read: 100%;
    --canvas-wide: 100%;
  }
  /* The page's structure, so the custom rules match exactly as on a page. */
  .preview-blocks {
    --canvas-gutter: 0px;
    padding: var(--ds-space-md);
  }
  .preview-blocks h3 { margin-top: 0; }
  .preview-blocks :global(> :last-child) { margin-bottom: 0; }
</style>
