<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Switches feed hidden inputs, so the actions read the checkbox-style 'on' value.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import FooterLinkList from './FooterLinkList.svelte';
  import TreeEditor from '$lib/features/site/routes/TreeEditor.svelte';
  import { Badge, Button, Icon, Input, Textarea, Switch, SettingsGroup, SettingsRow, EmptyState } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  let legalTextDraft = $state(untrack(() => data.legalText ?? ''));

  let brandingShowLogo = $state(untrack(() => data.branding.showLogo));
  let brandingTitle = $state(untrack(() => data.branding.title ?? ''));
  let brandingTagline = $state(untrack(() => data.branding.tagline ?? ''));
  let brandingLogoHeight = $state(untrack(() => data.branding.logoHeight));

</script>

<SettingsPageHead title={m.settings_footer_title()} intro={m.settings_footer_intro()} error={form?.error?.message ?? null} />

<SettingsGroup title={m.settings_footer_columns_heading()} class="columns-section">
  <div class="tree">
    <TreeEditor
      nodes={data.columns}
      allowTopLevelLinks={false}
      createAction="?/createColumnEntry"
      updateAction="?/updateColumnEntry"
      deleteAction="?/deleteColumnEntry"
      moveAction="?/moveColumnEntry"
      indentAction="?/indentColumnEntry"
      outdentAction="?/outdentColumnEntry"
    />
  </div>
</SettingsGroup>

<SettingsGroup title={m.settings_footer_legal_heading()} intro={m.settings_footer_legal_intro()} class="legal-section">
  <SettingsRow label={m.settings_footer_legal_text_label()} for="footer-legal-text">
    <form
      method="POST"
      action="?/saveLegalText"
      use:enhance={() => async ({ update }) => { await update({ reset: false }); }}
      class="legal-text-form"
    >
      <Textarea id="footer-legal-text" name="legalText" bind:value={legalTextDraft} rows={2} placeholder={m.settings_footer_legal_text_placeholder()} />
      {#if legalTextDraft !== (data.legalText ?? '')}
        <div class="form-actions"><Button type="submit" variant="primary">{m.settings_footer_save_text()}</Button></div>
      {/if}
    </form>
  </SettingsRow>
  <SettingsRow label={m.settings_footer_legal_links_label()} layout="wide">
    <FooterLinkList
      links={data.legalLinks}
      createAction="?/createLegalLink"
      updateAction="?/updateLegalLink"
      deleteAction="?/deleteLegalLink"
      moveAction="?/moveLegalLink"
    />
  </SettingsRow>
  <!-- Fixed, not footer data: the offer of the source code (AGPL-3.0 §13, Footer.svelte). -->
  <SettingsRow label={m.settings_footer_notice_label()} description={m.settings_footer_notice_desc()} class="software-notice">
    <span class="notice-state"><Icon name="info" /><Badge>{m.settings_footer_notice_badge()}</Badge></span>
  </SettingsRow>
</SettingsGroup>

<SettingsGroup title={m.settings_footer_branding_heading()} intro={m.settings_footer_branding_intro()} class="branding-section">
  <form
    method="POST"
    action="?/saveBranding"
    use:enhance={() => async ({ update }) => { await update({ reset: false }); }}
    class="branding-form"
  >
    <input type="hidden" name="showLogo" value={brandingShowLogo ? 'on' : ''} />
    <SettingsRow label={m.settings_branding_logo_heading()}>
      <Switch bind:checked={brandingShowLogo} disabled={!data.logoUrl}>{m.settings_footer_show_logo()}</Switch>
      {#if data.logoUrl}
        <div class="logo-preview"><img src={data.logoUrl} alt={m.settings_footer_logo_alt()} /></div>
      {:else}
        <EmptyState size="sm">{m.settings_footer_no_logo_lead()} <a href="/settings/branding">{m.settings_footer_no_logo_link()}</a> {m.settings_footer_no_logo_trail()}</EmptyState>
      {/if}
    </SettingsRow>
    <SettingsRow label={m.settings_footer_logo_height_label()} for="footer-logo-height">
      <Input id="footer-logo-height" type="number" name="logoHeight" bind:value={brandingLogoHeight} min="12" max="120" class="narrow" />
    </SettingsRow>
    <SettingsRow label={m.settings_footer_title_field()} for="footer-title">
      <Input id="footer-title" name="title" bind:value={brandingTitle} placeholder={m.settings_footer_title_placeholder()} class="field" />
    </SettingsRow>
    <SettingsRow label={m.settings_footer_tagline_field()} for="footer-tagline">
      <Input id="footer-tagline" name="tagline" bind:value={brandingTagline} placeholder={m.settings_footer_tagline_placeholder()} class="field" />
    </SettingsRow>
    <div class="form-actions section-actions">
      <Button type="submit" variant="primary">{m.settings_footer_save_branding()}</Button>
    </div>
  </form>
</SettingsGroup>

<style>
  .tree { padding-top: var(--ds-space-md); }
  .legal-text-form { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 480px; }
  .logo-preview img { max-height: 40px; max-width: 180px; object-fit: contain; }
  .branding-form :global(.field) { max-width: 380px; }
  .branding-form :global(.narrow) { max-width: 8rem; }
  .form-actions { display: flex; justify-content: flex-end; }
  .section-actions { padding-top: var(--ds-space-md); }
  .notice-state { display: inline-flex; align-items: center; gap: var(--ds-space-sm); color: var(--ds-color-muted); }
</style>
