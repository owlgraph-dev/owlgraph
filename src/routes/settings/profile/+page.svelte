<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // invalidateAll() after each action refreshes the app bar's name and avatar.
  // Language and appearance are device preferences in a cookie, with no action.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { Button, Input, Avatar, SettingsGroup, SettingsRow, SettingsWell, SegmentedControl, SegmentedControlItem } from '$lib/design-system';
  import { applyColorPref, currentColorPref } from '$lib/design-system/theme/applyColorPref';
  import { COLOR_PREFS, type ColorPref } from '$lib/design-system/theme/preference';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import LocaleSwitcher from '$lib/shell/LocaleSwitcher.svelte';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();

  let name = $state(untrack(() => data.name));
  let fileInput: HTMLInputElement | undefined = $state();
  let uploading = $state(false);
  // In the browser the <html> attribute, which a choice this visit has updated
  // and the layout's data has not.
  let colorPref = $state<ColorPref>(browser ? currentColorPref() : untrack(() => data.colorPref));

  const colorPrefLabel: Record<ColorPref, () => string> = {
    system: m.settings_profile_appearance_system,
    light: m.settings_profile_appearance_light,
    dark: m.settings_profile_appearance_dark,
  };

  function chooseColorPref(pref: ColorPref) {
    colorPref = pref;
    applyColorPref(pref);
  }
</script>

<SettingsPageHead title={m.settings_profile_title()} error={form?.error?.message ?? null} />

<SettingsGroup title={m.settings_profile_section_account()}>
  <SettingsRow label={m.settings_profile_name_label()} description={m.settings_profile_name_desc()} for="profile-name">
    <form
      class="name-form"
      method="POST"
      action="?/updateName"
      use:enhance={() => async ({ update }) => {
        await update();
        await invalidateAll();
      }}
    >
      <Input id="profile-name" name="name" bind:value={name} placeholder={m.settings_profile_name_placeholder()} autocomplete="off" />
      <Button type="submit" variant="primary">{m.settings_profile_name_save()}</Button>
    </form>
  </SettingsRow>

  <SettingsRow label={m.settings_profile_avatar_label()} description={m.settings_profile_avatar_desc()}>
    <SettingsWell>
      <Avatar src={data.avatarUrl} fallbackText={data.name || data.email} size="lg" alt={m.settings_profile_avatar_alt()} />
      {#if !data.avatarUrl}<span class="none">{m.settings_profile_avatar_none()}</span>{/if}
      {#snippet actions()}
        {#if data.avatarUrl}
          <Button type="button" variant="ghost" size="sm" loading={uploading} onclick={() => fileInput?.click()}>{m.settings_profile_avatar_replace()}</Button>
          <form
            method="POST"
            action="?/removeAvatar"
            class="inline"
            use:enhance={() => async ({ update }) => {
              await update();
              await invalidateAll();
            }}
          >
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_profile_avatar_remove()}</Button>
          </form>
        {:else}
          <Button variant="secondary" size="sm" loading={uploading} onclick={() => fileInput?.click()}>{m.settings_profile_avatar_upload()}</Button>
        {/if}
      {/snippet}
    </SettingsWell>
    <form
      method="POST"
      action="?/uploadAvatar"
      enctype="multipart/form-data"
      use:enhance={() => {
        uploading = true;
        return async ({ update }) => {
          await update();
          await invalidateAll();
          uploading = false;
          if (fileInput) fileInput.value = '';
        };
      }}
    >
      <input
        bind:this={fileInput}
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp"
        class="visually-hidden"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  </SettingsRow>

  <SettingsRow label={m.settings_profile_language_label()} description={m.settings_profile_language_desc()}>
    <LocaleSwitcher />
  </SettingsRow>

  <SettingsRow label={m.settings_profile_appearance_label()} description={m.settings_profile_appearance_desc()}>
    <SegmentedControl type="single" value={colorPref} ariaLabel={m.settings_profile_appearance_label()}>
      {#each COLOR_PREFS as pref (pref)}
        <SegmentedControlItem value={pref} onclick={() => chooseColorPref(pref)}>{colorPrefLabel[pref]()}</SegmentedControlItem>
      {/each}
    </SegmentedControl>
  </SettingsRow>
</SettingsGroup>

<style>
  .name-form { display: flex; gap: 0.5rem; align-items: center; width: 100%; max-width: 28rem; }
  .name-form :global(.ds-input) { flex: 1; }
  .inline { display: contents; }
  .none { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }</style>
