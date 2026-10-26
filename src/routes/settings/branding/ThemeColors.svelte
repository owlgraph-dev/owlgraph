<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The site theme's colours (docs/architecture/theming.md, "Site theme"), one draft saved
  // together. A hand-set accent is checked as it is picked, and on the server.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button, ColorPickerField, EmptyState, FieldError, FieldWarning, Input, SettingsRow, SettingsGroup, toast } from '$lib/design-system';
  import { accentShortfalls, brandTextRatio, resolveTheme, schemeAccent, type Shortfall, type StoredTheme } from '$lib/design-system/theme/siteTheme';
  import { SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
  import { formatNumber } from '$lib/platform/i18n/format';
  import * as m from '$lib/paraglide/messages';
  import ThemePreview from './ThemePreview.svelte';
  import { COLOR_SWATCHES } from '$lib/features/content';

  type Errors =
    | { accent?: string; lightAccent?: string; darkAccent?: string; appbarLight?: string; appbarDark?: string; footerLight?: string; footerDark?: string; brand?: string }
    | null
    | undefined;
  let { theme, errors }: { theme: StoredTheme; errors: Errors } = $props();

  type DraftBrand = { key: number; id: string | null; name: string; light: string; dark: string };
  let nextKey = 0;
  const initial = untrack(() => theme);
  let accent = $state<string | null>(initial.accent ?? null);
  let overrides = $state<Record<SchemeName, string | null>>({ light: initial.schemes?.light?.accent ?? null, dark: initial.schemes?.dark?.accent ?? null });
  let brand = $state<DraftBrand[]>((initial.brand ?? []).map((b) => ({ key: nextKey++, ...b })));
  let appbar = $state<Record<SchemeName, string | null>>({ light: initial.appbar?.light ?? null, dark: initial.appbar?.dark ?? null });
  let footer = $state<Record<SchemeName, string | null>>({ light: initial.footer?.light ?? null, dark: initial.footer?.dark ?? null });
  let saving = $state(false);

  const draft = $derived<StoredTheme>({
    version: 1,
    accent,
    schemes: { light: { accent: overrides.light }, dark: { accent: overrides.dark } },
    brand: brand.filter((b) => b.name.trim()).map((b) => ({ id: b.id ?? `new${b.key}`, name: b.name.trim(), light: b.light, dark: b.dark })),
    appbar: { light: appbar.light, dark: appbar.dark },
    footer: { light: footer.light, dark: footer.dark },
  });
  const sets = $derived(resolveTheme(draft));
  const accents = $derived({ light: schemeAccent(draft, 'light'), dark: schemeAccent(draft, 'dark') });
  const shortfalls = $derived(
    Object.fromEntries(SCHEME_NAMES.map((s) => [s, overrides[s] ? accentShortfalls(s, overrides[s]!, accents[s].soft) : []])) as Record<SchemeName, Shortfall[]>
  );

  const payload = $derived(
    JSON.stringify({
      accent,
      lightAccent: overrides.light,
      darkAccent: overrides.dark,
      appbarLight: appbar.light,
      appbarDark: appbar.dark,
      footerLight: footer.light,
      footerDark: footer.dark,
      brand: brand.map(({ id, name, light, dark }) => ({ id, name, light, dark })),
    })
  );

  const describe = (list: Shortfall[]) =>
    list.map((s) => `${s.pair} ${formatNumber(s.ratio, { maximumFractionDigits: 1 })}:1`).join(', ');

  const schemeLabel = { light: m.settings_branding_accent_light_label, dark: m.settings_branding_accent_dark_label };
  const footerLabel = { light: m.settings_branding_footer_light_label, dark: m.settings_branding_footer_dark_label };
  const footerErrorKey = { light: 'footerLight', dark: 'footerDark' } as const;
  const appbarLabel = { light: m.settings_branding_appbar_light_label, dark: m.settings_branding_appbar_dark_label };
  const appbarErrorKey = { light: 'appbarLight', dark: 'appbarDark' } as const;
  const errorKey = { light: 'lightAccent', dark: 'darkAccent' } as const;

  // A mid tone leaves neither text nor ground at 4.5:1; a warning, not a
  // refusal, since a band can bring its own text colour.
  function brandWarning(color: DraftBrand): string | null {
    const low = SCHEME_NAMES.map((scheme) => ({ scheme, ratio: brandTextRatio(scheme, color[scheme]) }))
      .filter((r): r is { scheme: SchemeName; ratio: number } => r.ratio !== null && r.ratio < 4.5);
    if (!low.length) return null;
    const worst = low.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const ratio = formatNumber(worst.ratio, { maximumFractionDigits: 1 });
    if (low.length === 2) return m.settings_branding_brand_contrast({ ratio });
    return worst.scheme === 'light' ? m.settings_branding_brand_contrast_light({ ratio }) : m.settings_branding_brand_contrast_dark({ ratio });
  }

  function addBrand() {
    brand.push({ key: nextKey++, id: null, name: '', light: '#0b3d91', dark: '#8fb8ff' });
  }
</script>

<SettingsGroup title={m.settings_branding_colors_heading()} intro={m.settings_branding_colors_intro()}>
  <SettingsRow label={m.settings_branding_accent_label()} description={m.settings_branding_accent_desc()}>
    <div class="stack">
      <ColorPickerField swatches={COLOR_SWATCHES}
        bind:value={accent}
        noneLabel={m.settings_branding_accent_default()}
        noneTitle={m.settings_branding_accent_default()}
        customTitle={m.settings_branding_accent_custom()}
        ariaLabel={m.settings_branding_accent_label()}
      />
      <p class="result">
        {#each SCHEME_NAMES as scheme (scheme)}
          <span class="result-item"><span class="dot" style="background: {accents[scheme].accent}"></span>{scheme === 'light' ? m.settings_branding_preview_light() : m.settings_branding_preview_dark()} <code>{accents[scheme].accent}</code></span>
        {/each}
      </p>
      {#if errors?.accent}<FieldError id="accent-error" message={m.settings_branding_accent_invalid()} />{/if}
    </div>
  </SettingsRow>

  {#each SCHEME_NAMES as scheme (scheme)}
    <SettingsRow label={schemeLabel[scheme]()} description={m.settings_branding_accent_scheme_desc()}>
      <div class="stack">
        <ColorPickerField swatches={COLOR_SWATCHES}
          value={overrides[scheme]}
          onValueChange={(v) => (overrides[scheme] = v)}
          noneLabel={m.settings_branding_accent_generated()}
          noneTitle={m.settings_branding_accent_generated()}
          customTitle={m.settings_branding_accent_custom()}
          ariaLabel={schemeLabel[scheme]()}
        />
        {#if errors?.[errorKey[scheme]] === 'invalid'}
          <FieldError id="{scheme}-accent-error" message={m.settings_branding_accent_invalid()} />
        {:else if shortfalls[scheme].length}
          <FieldError id="{scheme}-accent-contrast" message={m.settings_branding_accent_shortfall({ pairs: describe(shortfalls[scheme]) })} />
        {/if}
      </div>
    </SettingsRow>
  {/each}

  {#each SCHEME_NAMES as scheme (scheme)}
    <SettingsRow label={appbarLabel[scheme]()} description={scheme === 'light' ? m.settings_branding_appbar_desc() : m.settings_branding_appbar_dark_desc()}>
      <div class="stack">
        <ColorPickerField swatches={COLOR_SWATCHES}
          value={appbar[scheme]}
          onValueChange={(v) => (appbar[scheme] = v)}
          noneLabel={m.settings_branding_footer_none()}
          noneTitle={m.settings_branding_footer_none()}
          customTitle={m.settings_branding_accent_custom()}
          ariaLabel={appbarLabel[scheme]()}
        />
        {#if errors?.[appbarErrorKey[scheme]]}<FieldError id="{scheme}-appbar-error" message={m.settings_branding_accent_invalid()} />{/if}
      </div>
    </SettingsRow>
  {/each}

  {#each SCHEME_NAMES as scheme (scheme)}
    <SettingsRow label={footerLabel[scheme]()} description={scheme === 'light' ? m.settings_branding_footer_desc() : m.settings_branding_footer_dark_desc()}>
      <div class="stack">
        <ColorPickerField swatches={COLOR_SWATCHES}
          value={footer[scheme]}
          onValueChange={(v) => (footer[scheme] = v)}
          noneLabel={m.settings_branding_footer_none()}
          noneTitle={m.settings_branding_footer_none()}
          customTitle={m.settings_branding_accent_custom()}
          ariaLabel={footerLabel[scheme]()}
        />
        {#if errors?.[footerErrorKey[scheme]]}<FieldError id="{scheme}-footer-error" message={m.settings_branding_accent_invalid()} />{/if}
      </div>
    </SettingsRow>
  {/each}

  <SettingsRow label={m.settings_branding_brand_label()} description={m.settings_branding_brand_desc()} layout="wide">
    {#if brand.length === 0}
      <EmptyState size="sm">{m.settings_branding_brand_empty()}</EmptyState>
    {:else}
      <ul class="brand-list">
        {#each brand as color, i (color.key)}
          <li class="brand-row">
            <Input size="sm" bind:value={color.name} placeholder={m.settings_branding_brand_name_placeholder()} aria-label={m.settings_branding_brand_name()} class="brand-name" />
            <ColorPickerField swatches={COLOR_SWATCHES}
              value={color.light}
              onValueChange={(v) => v && (color.light = v)}
              noneLabel={m.settings_branding_brand_light()}
              noneTitle={m.settings_branding_brand_light()}
              customTitle={m.settings_branding_accent_custom()}
              ariaLabel={`${color.name || m.settings_branding_brand_name()} · ${m.settings_branding_brand_light()}`}
            />
            <ColorPickerField swatches={COLOR_SWATCHES}
              value={color.dark}
              onValueChange={(v) => v && (color.dark = v)}
              noneLabel={m.settings_branding_brand_dark()}
              noneTitle={m.settings_branding_brand_dark()}
              customTitle={m.settings_branding_accent_custom()}
              ariaLabel={`${color.name || m.settings_branding_brand_name()} · ${m.settings_branding_brand_dark()}`}
            />
            <Button variant="ghost-danger" size="sm" onclick={() => brand.splice(i, 1)}>{m.settings_branding_brand_remove({ name: color.name || m.settings_branding_brand_name() })}</Button>
            {#if brandWarning(color)}
              <div class="brand-warning"><FieldWarning id="brand-{color.key}-contrast" message={brandWarning(color)!} /></div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if errors?.brand}<FieldError id="brand-error" message={m.settings_branding_brand_invalid()} />{/if}
    <div class="add"><Button size="sm" onclick={addBrand}>{m.settings_branding_brand_add()}</Button></div>
  </SettingsRow>

  <SettingsRow label={m.settings_branding_preview_label()} description={m.settings_branding_preview_desc()} layout="wide">
    <ThemePreview {sets} brand={draft.brand ?? []} />
  </SettingsRow>

  <div class="actions">
    <form
      method="POST"
      action="?/resetColors"
      use:enhance={() => async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') {
          accent = null;
          overrides = { light: null, dark: null };
          brand = [];
          toast.success(m.settings_branding_colors_saved());
        }
      }}
    >
      <Button type="submit" variant="ghost-danger">{m.settings_branding_colors_reset()}</Button>
    </form>
    <form
      method="POST"
      action="?/saveColors"
      use:enhance={() => {
        saving = true;
        return async ({ result, update }) => {
          await update({ reset: false });
          saving = false;
          if (result.type === 'success') toast.success(m.settings_branding_colors_saved());
        };
      }}
    >
      <input type="hidden" name="colors" value={payload} />
      <Button type="submit" variant="primary" loading={saving}>{m.settings_branding_colors_save()}</Button>
    </form>
  </div>
</SettingsGroup>

<style>
  .stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ds-space-sm); }
  .result { margin: 0; display: flex; flex-wrap: wrap; gap: var(--ds-space-md); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .result-item { display: inline-flex; align-items: center; gap: 0.35rem; }
  .dot { width: 0.75rem; height: 0.75rem; border-radius: 50%; border: 1px solid var(--ds-color-border); }
  .brand-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .brand-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
  .brand-row :global(.brand-name) { max-width: 14rem; }
  .brand-warning { flex-basis: 100%; }
  .add { padding-top: var(--ds-space-sm); }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--ds-space-sm); padding-top: var(--ds-space-md); }
</style>
