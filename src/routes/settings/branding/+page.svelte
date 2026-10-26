<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The settings-row pattern (docs/architecture/settings.md); an auto-submitting picker
  // feeds a hidden input and submits its row's own form.
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import TypographyTokenCard from './TypographyTokenCard.svelte';
  import ThemeColors from './ThemeColors.svelte';
  import BlockDefaults from './BlockDefaults.svelte';
  import { Button, Input, Select, SettingsGroup, SettingsRow, SettingsWell, FormField, EmptyState, Table, TableRow, TableCell, Switch, Dialog, type TableColumn } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import ParagraphStyleModal from '$lib/features/site/routes/ParagraphStyleModal.svelte';
  import CatalogLabel from '$lib/features/semantic/routes/CatalogLabel.svelte';
  import { localize, missingLocales } from '$lib/platform/i18n/localizedText';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let uploading = $state(false);
  let darkFileInput: HTMLInputElement | undefined = $state();
  let uploadingDark = $state(false);
  let newTokenName = $state('');

  // Select has no empty item, so "unbranded" is a sentinel the hidden input
  // maps back to the empty string the actions expect.
  const NONE = '__default__';
  const fontItems = $derived([
    { value: NONE, label: m.settings_branding_typography_unbranded() },
    { value: 'sans', label: m.settings_branding_typography_font_sans() },
    { value: 'serif', label: m.settings_branding_typography_font_serif() },
    { value: 'mono', label: m.settings_branding_typography_font_mono() },
    ...data.customFonts.map((f) => ({ value: f.id, label: f.name })),
  ]);
  const tokenItems = $derived([
    { value: NONE, label: m.settings_branding_typography_unbranded() },
    ...data.tokens.map((t) => ({ value: t.id, label: t.name })),
  ]);

  let uiFontForm: HTMLFormElement | undefined = $state();
  let pendingUiFont = $state<string | null>(null);
  async function submitUiFont(v: string) {
    pendingUiFont = v === NONE ? '' : v;
    await tick();
    uiFontForm?.requestSubmit();
  }

  // Paragraph styles (docs/architecture/typography.md); a name is localized text, shown
  // resolved with the missing-translation indicator (docs/architecture/languages.md).
  type StyleRow = (typeof data.paragraphStyles)[number];
  const styleName = (style: StyleRow) => localize(style.label, style.id);
  type StyleModal = { mode: 'create' } | { mode: 'edit'; style: StyleRow };
  let styleModal = $state<StyleModal | null>(null);
  let deletingStyle = $state<StyleRow | null>(null);
  const deleteStyleFormId = 'paragraph-style-delete-form';
  let styleTokenForms = $state<Record<string, HTMLFormElement | undefined>>({});
  let pendingStyleToken = $state<Record<string, string>>({});
  async function submitStyleToken(id: string, v: string) {
    pendingStyleToken[id] = v === NONE ? '' : v;
    await tick();
    styleTokenForms[id]?.requestSubmit();
  }
  const styleColumns = $derived<TableColumn[]>([
    { label: m.settings_branding_paragraph_styles_col_label() },
    { label: m.settings_branding_paragraph_styles_col_render_as(), width: '7rem' },
    { label: m.settings_branding_paragraph_styles_col_token(), width: '14rem' },
    { label: m.settings_branding_paragraph_styles_col_default(), width: '6rem' },
    { label: m.settings_col_actions(), width: '6rem', align: 'end', hideLabel: true },
  ]);
</script>

<SettingsPageHead title={m.settings_branding_title()} error={form?.error?.message ?? null} />

<SettingsGroup title={m.settings_branding_identity_heading()}>
  <SettingsRow label={m.settings_branding_logo_heading()} description={m.settings_branding_intro()}>
    {#if data.logo}
      <SettingsWell class="current">
        <img src={data.logo.url} alt={m.settings_branding_alt()} class="preview" />
        {#snippet actions()}
          <Button type="button" variant="ghost" size="sm" loading={uploading} onclick={() => fileInput?.click()}>{m.settings_branding_replace()}</Button>
          <form method="POST" action="?/remove" use:enhance class="inline">
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_branding_remove()}</Button>
          </form>
        {/snippet}
      </SettingsWell>
    {:else}
      <EmptyState size="sm">
        {m.settings_branding_none()}
        {#snippet actions()}
          <Button variant="primary" loading={uploading} onclick={() => fileInput?.click()}>{m.settings_branding_upload()}</Button>
        {/snippet}
      </EmptyState>
    {/if}
    <form
      method="POST"
      action="?/upload"
      enctype="multipart/form-data"
      use:enhance={() => {
        uploading = true;
        return async ({ update }) => {
          await update();
          uploading = false;
          if (fileInput) fileInput.value = '';
        };
      }}
    >
      <input
        bind:this={fileInput}
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        class="visually-hidden"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  </SettingsRow>

  <SettingsRow label={m.settings_branding_dark_logo_heading()} description={m.settings_branding_dark_logo_intro()}>
    {#if data.darkLogo}
      <SettingsWell class="current-dark">
        <img src={data.darkLogo.url} alt={m.settings_branding_dark_logo_alt()} class="preview" />
        {#snippet actions()}
          <Button type="button" variant="ghost" size="sm" loading={uploadingDark} onclick={() => darkFileInput?.click()}>{m.settings_branding_replace()}</Button>
          <form method="POST" action="?/removeDark" use:enhance class="inline">
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_branding_remove()}</Button>
          </form>
        {/snippet}
      </SettingsWell>
    {:else}
      <EmptyState size="sm">
        {m.settings_branding_dark_logo_none()}
        {#snippet actions()}
          <Button loading={uploadingDark} onclick={() => darkFileInput?.click()}>{m.settings_branding_dark_logo_upload()}</Button>
        {/snippet}
      </EmptyState>
    {/if}
    <form
      method="POST"
      action="?/uploadDark"
      enctype="multipart/form-data"
      use:enhance={() => {
        uploadingDark = true;
        return async ({ update }) => {
          await update();
          uploadingDark = false;
          if (darkFileInput) darkFileInput.value = '';
        };
      }}
    >
      <input
        bind:this={darkFileInput}
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        aria-label={m.settings_branding_dark_logo_upload()}
        class="visually-hidden"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  </SettingsRow>

  <form method="POST" action="?/setUiFont" use:enhance bind:this={uiFontForm} class="ui-font-row">
    <input type="hidden" name="family" value={pendingUiFont ?? data.uiFontFamily ?? ''} />
    <SettingsRow label={m.settings_branding_ui_font_heading()} description={m.settings_branding_ui_font_intro()}>
      <Select items={fontItems} value={data.uiFontFamily ?? NONE} ariaLabel={m.settings_branding_ui_font_heading()} onValueChange={submitUiFont} />
    </SettingsRow>
  </form>
</SettingsGroup>

<!-- Remounted once saved colours come back, so the draft picks up the ids the server gave new brand colours. -->
{#key JSON.stringify(data.siteTheme)}
  <ThemeColors theme={data.siteTheme} errors={form?.colorErrors} />
{/key}

<SettingsGroup title={m.settings_branding_typography_heading()} intro={m.settings_branding_typography_intro()}>
  <SettingsRow label={m.settings_branding_typography_tokens_heading()} layout="wide">
    {#if data.tokens.length === 0}
      <EmptyState size="sm">{m.settings_branding_typography_tokens_empty()}</EmptyState>
    {:else}
      <div class="token-list">
        {#each data.tokens as token (token.id)}
          <TypographyTokenCard {token} customFonts={data.customFonts} />
        {/each}
      </div>
    {/if}
    <form
      method="POST"
      action="?/createTypographyToken"
      use:enhance={() => async ({ update }) => { await update(); newTokenName = ''; }}
      class="new-token"
    >
      <div class="new-token-field"><FormField label={m.settings_branding_typography_new_token_label()}><Input name="name" bind:value={newTokenName} placeholder={m.settings_branding_typography_new_token_placeholder()} required /></FormField></div>
      <Button type="submit" variant="primary" disabled={!newTokenName.trim()}>{m.settings_branding_typography_add_token()}</Button>
    </form>
  </SettingsRow>
  <SettingsRow label={m.settings_branding_paragraph_styles_heading()} description={m.settings_branding_paragraph_styles_intro()} layout="wide">
    <Table columns={styleColumns} minWidth="40rem" ariaLabel={m.settings_branding_paragraph_styles_heading()}>
      {#each data.paragraphStyles as style (style.id)}
        <TableRow>
          <TableCell><CatalogLabel label={styleName(style)} missing={missingLocales(style.label)} /></TableCell>
          <TableCell mono nowrap>{style.renderAs}</TableCell>
          <TableCell>
            <form method="POST" action="?/setParagraphStyleToken" use:enhance bind:this={styleTokenForms[style.id]} class="paragraph-style-row">
              <input type="hidden" name="id" value={style.id} />
              <input type="hidden" name="tokenId" value={pendingStyleToken[style.id] ?? style.tokenId ?? ''} />
              <Select
                size="sm"
                width="full"
                items={tokenItems}
                value={style.tokenId ?? NONE}
                ariaLabel={m.settings_branding_paragraph_styles_token_aria({ style: styleName(style) })}
                onValueChange={(v) => submitStyleToken(style.id, v)}
              />
            </form>
          </TableCell>
          <TableCell>
            <!-- The default is only replaced, never switched off; a Switch applies
                 at once, so it submits its own row's form (docs/architecture/settings.md). -->
            <form id={`paragraph-style-default-${style.id}`} method="POST" action="?/setDefaultParagraphStyle" use:enhance title={style.isDefault ? m.settings_branding_paragraph_styles_default_locked() : undefined}>
              <input type="hidden" name="id" value={style.id} />
              <Switch
                checked={style.isDefault}
                disabled={style.isDefault}
                size="sm"
                ariaLabel={m.settings_branding_paragraph_styles_default_aria({ style: styleName(style) })}
                onCheckedChange={() => (document.getElementById(`paragraph-style-default-${style.id}`) as HTMLFormElement | null)?.requestSubmit()}
              />
            </form>
          </TableCell>
          <TableCell actions>
            <Button type="button" variant="ghost" size="sm" icon title={m.settings_branding_paragraph_styles_edit()} aria-label={m.settings_branding_paragraph_styles_edit()} onclick={() => (styleModal = { mode: 'edit', style })}>
              <Icon name="pencil" size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost-danger"
              size="sm"
              icon
              disabled={style.isDefault}
              title={style.isDefault ? m.settings_branding_paragraph_styles_delete_blocked() : m.settings_branding_paragraph_styles_delete()}
              aria-label={m.settings_branding_paragraph_styles_delete()}
              onclick={() => (deletingStyle = style)}
            >
              <Icon name="trash" size={14} />
            </Button>
          </TableCell>
        </TableRow>
      {/each}
    </Table>
    <div class="paragraph-style-add">
      <Button variant="primary" onclick={() => (styleModal = { mode: 'create' })}>{m.settings_branding_paragraph_styles_add()}</Button>
    </div>
  </SettingsRow>
</SettingsGroup>

<!-- Remounted once saved defaults come back, so the draft starts from what the server kept. -->
{#key JSON.stringify(data.siteTheme.blockDefaults ?? null)}
  <BlockDefaults theme={data.siteTheme} />
{/key}

{#if styleModal}
  <ParagraphStyleModal
    open={true}
    onOpenChange={(v) => {
      if (!v) styleModal = null;
    }}
    mode={styleModal.mode}
    style={styleModal.mode === 'edit' ? styleModal.style : null}
    tokens={data.tokens.map((t) => ({ id: t.id, name: t.name }))}
    error={form?.error?.message ?? null}
    onSaved={() => (styleModal = null)}
  />
{/if}

<!-- A confirm step, never confirm() (docs/architecture/design-system/patterns.md, "Settings pages"). -->
<Dialog
  open={deletingStyle !== null}
  onOpenChange={(o) => { if (!o) deletingStyle = null; }}
  size="sm"
  variant="danger"
  title={m.settings_branding_paragraph_styles_delete_title()}
  description={m.settings_branding_paragraph_styles_delete_confirm()}
>
  <form id={deleteStyleFormId} method="POST" action="?/deleteParagraphStyle" use:enhance={() => async ({ update }) => { await update(); deletingStyle = null; }}>
    <input type="hidden" name="id" value={deletingStyle?.id ?? ''} />
  </form>
  {#snippet footer()}
    <Button type="button" onclick={() => (deletingStyle = null)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={deleteStyleFormId} variant="danger">{m.settings_branding_paragraph_styles_delete()}</Button>
  {/snippet}
</Dialog>

<style>
  /* Not max-height alone: an SVG logo without intrinsic size would collapse
     to 0×0 in the well's flex row. */
  .preview { display: block; height: 48px; width: auto; max-width: 200px; object-fit: contain; }
  .inline { display: contents; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }  .token-list { margin-bottom: 0.8rem; }
  .new-token { display: flex; align-items: flex-end; gap: 0.8rem; border: 1px dashed var(--ds-color-border); border-radius: var(--ds-radius-md); padding: 0.8rem 0.9rem; }
  .new-token-field { flex: 1; max-width: 320px; }
  .paragraph-style-row { display: block; }
  .paragraph-style-add { margin-top: 0.8rem; }
</style>
