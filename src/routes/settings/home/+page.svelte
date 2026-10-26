<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { PagePicker } from '$lib/features/search/picker';
  import { Button, SettingsRow, SettingsWell, EmptyState } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import { nodePath } from '$lib/features/nodes';
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();

  type PageResult = { id: string; slug: string; title: string };

  let picking = $state(false);
  let picked = $state<PageResult | null>(null);

  function cancelPick() {
    picking = false;
    picked = null;
  }
</script>

<SettingsPageHead title={m.settings_home_title()} intro={m.settings_home_intro()}>
  {#if !data.homePage}
    <Button variant="primary" onclick={() => (picking = true)}>{m.settings_home_set_button()}</Button>
  {/if}
</SettingsPageHead>

<div class="rows">
  <SettingsRow label={m.settings_home_row_label()}>
    {#if data.homePage}
      {@const home = data.homePage}
      <SettingsWell>
        <span class="current"><strong>{home.title}</strong> <span class="slug">/{home.slug}</span></span>
        {#snippet actions()}
          <a class="view" href={nodePath(home.namespace_slug, home.slug)} target="_blank" rel="noopener">{m.settings_home_view()}</a>
          <Button type="button" variant="ghost" size="sm" onclick={() => (picking = true)}>{m.settings_home_change()}</Button>
          <form method="POST" action="?/clearHome" use:enhance class="inline">
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_home_clear()}</Button>
          </form>
        {/snippet}
      </SettingsWell>
    {:else}
      <EmptyState size="sm">{m.settings_home_none()}</EmptyState>
    {/if}
  </SettingsRow>

  {#if picking}
    <SettingsRow label={m.settings_home_set_button()} layout="wide">
      <form
        method="POST"
        action="?/setHome"
        use:enhance={() => async ({ update }) => { await update(); picking = false; picked = null; }}
        class="pick-form"
      >
        <input type="hidden" name="id" value={picked?.id ?? ''} />
        {#if picked}
          <p class="picked">{picked.title} <span class="slug">/{picked.slug}</span> <Button type="button" variant="ghost" size="sm" onclick={() => (picked = null)}>{m.settings_home_change()}</Button></p>
          <div class="form-actions">
            <Button type="submit" variant="primary">{m.settings_home_set_as_home()}</Button>
            <Button type="button" onclick={cancelPick}>{m.settings_home_cancel()}</Button>
          </div>
        {:else}
          <PagePicker onselect={(p) => (picked = p)} />
          <div class="form-actions">
            <Button type="button" variant="ghost" size="sm" onclick={cancelPick}>{m.settings_home_cancel()}</Button>
          </div>
        {/if}
      </form>
    </SettingsRow>
  {/if}
</div>

<style>
  .rows { border-top: 1px solid var(--ds-color-border); }
  .current { font-size: var(--ds-text-md); }
  .slug { color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .view { color: var(--ds-color-accent); font-size: var(--ds-text-sm); }
  .inline { display: contents; }
  .pick-form { display: flex; flex-direction: column; gap: 0.6rem; max-width: 420px; }
  .picked { margin: 0; font-size: var(--ds-text-md); display: flex; align-items: center; gap: var(--ds-space-sm); }
  .form-actions { display: flex; gap: 0.6rem; }
</style>
