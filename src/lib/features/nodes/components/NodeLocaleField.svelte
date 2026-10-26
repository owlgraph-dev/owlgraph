<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The node's content language, not the interface's (docs/architecture/languages.md). A language
  // disabled since stays, shown as such.
  import { untrack } from 'svelte';
  import { FormField, Select } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { enabledLocales, isSupportedLocale } from '$lib/platform/i18n/siteLocales';
  import { localeName } from '$lib/platform/i18n/localeNames';

  let {
    locale,
    onSetLocale,
  }: {
    locale: string;
    onSetLocale?: (locale: string) => Promise<{ ok: boolean; error?: string }>;
  } = $props();

  let current = $state(untrack(() => locale));
  // Resyncs when the route data reloads after a change.
  $effect(() => {
    current = locale;
  });
  let error = $state<string | null>(null);

  const name = (code: string) => (isSupportedLocale(code) ? localeName(code) : code);
  const items = $derived([
    ...enabledLocales().map((code) => ({ value: code, label: name(code) })),
    ...((enabledLocales() as readonly string[]).includes(current)
      ? []
      : [{ value: current, label: m.editor_locale_field_disabled({ language: name(current) }), disabled: true }]),
  ]);

  async function choose(value: string) {
    if (value === current) return;
    const prev = current;
    current = value;
    error = null;
    const res = await onSetLocale?.(value);
    if (res && !res.ok) {
      current = prev;
      error = res.error ?? m.editor_locale_field_failed();
    }
  }
</script>

<div class="locale-field">
  <FormField label={m.editor_locale_field_label()} hint={m.editor_locale_field_hint()} {error}>
    <Select {items} value={current} onValueChange={choose} disabled={!onSetLocale} width="full" />
  </FormField>
</div>

<style>
  .locale-field { margin: 0 0 0.9rem; }
</style>
