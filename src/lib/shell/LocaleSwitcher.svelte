<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // /api/locale stores the explicit choice in its cookie and, when signed in,
  // on the account; then the page reloads in it (docs/architecture/languages.md).
  import { Select, toast } from '$lib/design-system';
  import { getLocale } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';
  import { enabledLocales } from '$lib/platform/i18n/siteLocales';
  import { localeName } from '$lib/platform/i18n/localeNames';

  const items = enabledLocales().map((locale) => ({ value: locale, label: localeName(locale) }));

  let value = $state<string>(getLocale());

  async function onValueChange(next: string) {
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    });
    if (res.ok) {
      location.reload();
    } else {
      value = getLocale();
      toast.error(m.locale_switcher_failed());
    }
  }
</script>

<Select {items} bind:value {onValueChange} ariaLabel={m.locale_switcher_aria()} />
