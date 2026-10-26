<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Languages (docs/architecture/languages.md): one form, sent on every change. The default is
  // always enabled, so its checkbox stays checked and locked.
  import { tick, untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Checkbox, Select, SettingsRow, toast } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { localeName } from '$lib/platform/i18n/localeNames';
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();

  let enabled = $state<string[]>(untrack(() => [...data.config.enabled]));
  let defaultLocale = $state<string>(untrack(() => data.config.defaultLocale));
  let form = $state<HTMLFormElement | null>(null);

  const defaultItems = $derived(data.supported.filter((l) => enabled.includes(l)).map((l) => ({ value: l, label: localeName(l) })));

  async function submit() {
    await tick();
    form?.requestSubmit();
  }

  function toggle(code: string, on: boolean) {
    enabled = on ? [...enabled, code] : enabled.filter((l) => l !== code);
    submit();
  }

  function chooseDefault(code: string) {
    defaultLocale = code;
    if (!enabled.includes(code)) enabled = [...enabled, code];
    submit();
  }
</script>

<SettingsPageHead title={m.settings_languages_title()} intro={m.settings_languages_intro()} />

<form
  method="POST"
  action="?/save"
  bind:this={form}
  use:enhance={() => async ({ result, update }) => {
    await update({ reset: false });
    // What the server stored, whatever was asked for.
    enabled = [...data.config.enabled];
    defaultLocale = data.config.defaultLocale;
    if (result.type === 'success') toast.success(m.settings_languages_saved());
    else toast.error(m.settings_languages_save_failed());
  }}
>
  <div class="rows">
    <SettingsRow label={m.settings_languages_enabled_label()} description={m.settings_languages_enabled_desc()}>
      <div class="locales">
        {#each data.supported as code (code)}
          <Checkbox
            name="enabled"
            value={code}
            checked={enabled.includes(code)}
            disabled={code === defaultLocale}
            onCheckedChange={(on) => toggle(code, on)}
          >
            {localeName(code)}
          </Checkbox>
        {/each}
      </div>
    </SettingsRow>
    <SettingsRow label={m.settings_languages_default_label()} description={m.settings_languages_default_desc()}>
      <Select name="defaultLocale" items={defaultItems} value={defaultLocale} onValueChange={chooseDefault} ariaLabel={m.settings_languages_default_label()} />
    </SettingsRow>
  </div>
</form>

<style>
  .rows { border-top: 1px solid var(--ds-color-border); }
  .locales { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
</style>
