<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The unsaved colours in both schemes: each panel redefines its scheme's set
  // on itself, outranking the site's by one class, so everything inside shows the draft.
  import { Button, Badge, SegmentedControl, SegmentedControlItem, Switch } from '$lib/design-system';
  import { emitSchemeBlock } from '$lib/design-system/theme/emit';
  import { SCHEME_NAMES, type SchemeSets } from '$lib/design-system/theme/tokens';
  import { brandProperty, type BrandColor } from '$lib/design-system/theme/siteTheme';
  import * as m from '$lib/paraglide/messages';

  let { sets, brand }: { sets: SchemeSets; brand: BrandColor[] } = $props();

  const uid = $props.id();
  const scope = `theme-preview-${uid.replace(/[^\w-]/g, '')}`;
  const css = $derived(SCHEME_NAMES.map((scheme) => emitSchemeBlock(`.${scope}[data-scheme="${scheme}"]`, scheme, sets[scheme])).join(''));
  const label = { light: m.settings_branding_preview_light, dark: m.settings_branding_preview_dark };
</script>

<svelte:head>{@html `<style>${css}</style>`}</svelte:head>

<div class="previews">
  {#each SCHEME_NAMES as scheme (scheme)}
    <!-- A picture of the colours, not controls: inert keeps it out of the tab order and the accessibility tree. -->
    <section class="{scope} panel" data-scheme={scheme} inert>
      <p class="caption">{label[scheme]()}</p>
      <p class="bar">{m.settings_branding_preview_appbar()}</p>
      <div class="chrome">
        <Button variant="primary" size="sm">{m.settings_branding_preview_button()}</Button>
        <Button variant="secondary" size="sm">{m.settings_branding_preview_secondary()}</Button>
        <SegmentedControl type="single" size="sm" value="a" ariaLabel={m.settings_branding_preview_selected()}>
          <SegmentedControlItem value="a">{m.settings_branding_preview_selected()}</SegmentedControlItem>
          <SegmentedControlItem value="b">{m.settings_branding_preview_other()}</SegmentedControlItem>
        </SegmentedControl>
        <Switch checked ariaLabel={m.settings_branding_preview_selected()} />
        <Badge tone="accent">{m.settings_branding_accent_label()}</Badge>
      </div>
      <div class="page">
        <p class="heading">{m.settings_branding_preview_heading()}</p>
        <p>{m.settings_branding_preview_text()} <a href="#preview">{m.settings_branding_preview_link()}</a></p>
        {#if brand.length}
          <div class="swatches">
            {#each brand as color (color.id)}
              <span class="chip" style="background: var({brandProperty(color.id)}); color: var({brandProperty(color.id)}-fg)">{color.name}</span>
            {/each}
          </div>
        {/if}
      </div>
      <p class="footer">{m.settings_branding_preview_footer()}</p>
    </section>
  {/each}
</div>

<style>
  .previews { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: var(--ds-space-md); }
  .panel {
    background: var(--ds-color-bg);
    color: var(--ds-color-fg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    padding: var(--ds-space-md);
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
  }
  .caption { margin: 0; font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .bar {
    margin: 0;
    padding: var(--ds-space-sm) var(--ds-space-md);
    border-bottom: 1px solid var(--ds-appbar-border);
    background: var(--ds-appbar-bg);
    color: var(--ds-appbar-fg);
    font-size: var(--ds-text-xs);
  }
  .chrome { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
  .page { background: var(--content-bg); color: var(--content-fg); border-radius: var(--ds-radius-sm); padding: var(--ds-space-md); }
  .page p { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-text-sm); }
  .page .heading { font-size: var(--ds-text-md); font-weight: 600; }
  .page a { color: var(--content-link); }
  .footer {
    margin: 0;
    padding: var(--ds-space-sm) var(--ds-space-md);
    border-top: 1px solid var(--ds-footer-border);
    background: var(--ds-footer-bg);
    color: var(--ds-footer-muted);
    font-size: var(--ds-text-xs);
  }
  .swatches { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
  .chip { border-radius: var(--ds-radius-sm); padding: 0.15rem 0.5rem; font-size: var(--ds-text-xs); }
</style>
