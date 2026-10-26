<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The design system's LocalizedTextField bound to the site's languages
  // (docs/architecture/languages.md); the primitive itself knows no language. Text in a disabled
  // language is kept, with a note.
  import { LocalizedTextField, type LocalizedTextLocale } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { COMMON_FALLBACK_LOCALE } from '$lib/platform/i18n/localizedText';
  import { enabledLocales, isSupportedLocale, siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
  import { localeName, localeNameInUi } from '$lib/platform/i18n/localeNames';

  let {
    label,
    name,
    value = $bindable({}),
    required = false,
    multiline = false,
    placeholder,
    hint,
    error = null,
    autofocus = false,
  }: {
    label: string;
    name: string;
    value?: Record<string, string | undefined>;
    /** A label: the site default language must be filled. Otherwise the
     * whole field is optional (a description, an inverse label). */
    required?: boolean;
    multiline?: boolean;
    placeholder?: string;
    hint?: string;
    error?: string | null;
    autofocus?: boolean;
  } = $props();

  /** The enabled languages, the author's interface language first. */
  function localizedFieldLocales({ requireDefault }: { requireDefault: boolean }): LocalizedTextLocale[] {
    const own = getLocale();
    const enabled = enabledLocales();
    return [...enabled.filter((l) => l === own), ...enabled.filter((l) => l !== own)].map((code) => ({
      code,
      label: localeName(code),
      required: requireDefault && code === siteDefaultLocale(),
    }));
  }

  const locales = $derived(localizedFieldLocales({ requireDefault: required }));
  const offered = $derived(new Set(locales.map((l) => l.code)));
  const preservedNames = $derived(
    Object.keys(value)
      .filter((code) => !offered.has(code) && value[code]?.trim())
      .map((code) => (isSupportedLocale(code) ? localeName(code) : code))
  );
</script>

<LocalizedTextField
  {label}
  {name}
  bind:value
  {locales}
  {multiline}
  {placeholder}
  {hint}
  {error}
  {autofocus}
  optionalLabel={required ? undefined : m.form_field_optional()}
  languageLabel={m.localized_field_language()}
  missingLabel={m.localized_field_missing()}
  requiredLabel={m.localized_field_required()}
  progressLabel={(filled, total) => m.localized_field_progress({ filled, total })}
  copyFrom={COMMON_FALLBACK_LOCALE}
  copyLabel={m.localized_field_copy_from({ language: localeNameInUi(COMMON_FALLBACK_LOCALE) })}
  preservedNote={preservedNames.length > 0 ? m.localized_field_preserved({ languages: preservedNames.join(', ') }) : undefined}
/>
