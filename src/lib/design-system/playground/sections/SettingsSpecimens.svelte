<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import SettingsGroup from '../../SettingsGroup.svelte';
  import SettingsRow from '../../SettingsRow.svelte';
  import SettingsWell from '../../SettingsWell.svelte';
  import Input from '../../Input.svelte';
  import Textarea from '../../Textarea.svelte';
  import Select from '../../Select.svelte';
  import Switch from '../../Switch.svelte';
  import Button from '../../Button.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  let siteName = $state('Owlgraph');
  let tagline = $state('A model-driven knowledge graph platform');
  let locale = $state('en');
  let indexable = $state(true);
  let footer = $state('© Owlgraph\nAll rights reserved.');

  const locales = [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
  ];
</script>

<SpecimenGrid title="SettingsGroup (title, intro, rows)">
  <Specimen label="section with intro and three rows" state="section" wide>
    <SettingsGroup title="General" intro="How the site names itself and which language it speaks by default.">
      <SettingsRow label="Site name" description="Shown in the browser tab and the app bar." for="pg-settings-name">
        <Input id="pg-settings-name" bind:value={siteName} />
      </SettingsRow>
      <SettingsRow label="Default language" description="Used when a visitor has no preference.">
        <Select items={locales} bind:value={locale} ariaLabel="Default language" />
      </SettingsRow>
      <SettingsRow label="Indexable" description="Allow search engines to index public pages.">
        <Switch bind:checked={indexable} ariaLabel="Indexable" />
      </SettingsRow>
    </SettingsGroup>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="SettingsRow — layout">
  <Specimen label="split, for= (real label) beside an Input" state="row-split-input" wide>
    <SettingsRow label="Tagline" description="One line under the site name on the home page." for="pg-settings-tagline">
      <Input id="pg-settings-tagline" bind:value={tagline} />
    </SettingsRow>
  </Specimen>
  <Specimen label="split, group (no for) beside a Select" state="row-split-select" wide>
    <SettingsRow label="Default language" description="Used when a visitor has no preference.">
      <Select items={locales} bind:value={locale} ariaLabel="Default language" />
    </SettingsRow>
  </Specimen>
  <Specimen label="split, group beside a Switch" state="row-split-switch" wide>
    <SettingsRow label="Indexable" description="Allow search engines to index public pages.">
      <Switch bind:checked={indexable} ariaLabel="Indexable" />
    </SettingsRow>
  </Specimen>
  <Specimen label="wide, control full-width beneath (Textarea)" state="row-wide-textarea" wide>
    <SettingsRow label="Footer text" description="Plain text, shown on every public page." layout="wide" for="pg-settings-footer">
      <Textarea id="pg-settings-footer" bind:value={footer} rows={3} />
    </SettingsRow>
  </Specimen>
  <Specimen label="no description" state="row-no-description" wide>
    <SettingsRow label="Site name" for="pg-settings-name-2">
      <Input id="pg-settings-name-2" bind:value={siteName} />
    </SettingsRow>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="SettingsRow — a narrow row stacks (its own container query, no ancestor needed)">
  <Specimen label="inside a plain 20rem box (no container-type on it)" state="row-narrow-container" wide>
    <div class="narrow-container">
      <SettingsRow label="Site name" description="Shown in the browser tab and the app bar." for="pg-settings-name-3">
        <Input id="pg-settings-name-3" bind:value={siteName} />
      </SettingsRow>
    </div>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="SettingsWell (asset preview with actions)">
  <Specimen label="in a wide row, actions snippet" state="well" wide>
    <SettingsRow label="Logo" description="Shown in the app bar. SVG or PNG, at least 64 px tall." layout="wide">
      <SettingsWell>
        {#snippet actions()}
          <Button size="sm">Replace</Button>
          <Button size="sm" variant="ghost-danger">Remove</Button>
        {/snippet}
        <div class="placeholder" role="img" aria-label="Logo preview placeholder"></div>
        <span class="meta">logo.svg · 4 KB</span>
      </SettingsWell>
    </SettingsRow>
  </Specimen>
  <Specimen label="no actions" state="well-plain" wide>
    <SettingsWell>
      <div class="placeholder" role="img" aria-label="Preview placeholder"></div>
      <span class="meta">No actions on this well.</span>
    </SettingsWell>
  </Specimen>
</SpecimenGrid>

<style>
  .narrow-container {
    width: 20rem;
    max-width: 100%;
    border: 1px dashed var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
    padding: 0 var(--ds-space-sm);
  }
  .placeholder {
    width: 4rem;
    height: 4rem;
    flex: none;
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-accent-soft);
    border: 1px solid var(--ds-color-border);
  }
  .meta { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
