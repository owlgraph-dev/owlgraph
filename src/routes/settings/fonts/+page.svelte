<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Cards, not a table: variants are uploaded per family.
  import FontFamilyCard from './FontFamilyCard.svelte';
  import { Button, EmptyState } from '$lib/design-system';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import FontFamilyModal from '$lib/features/content/routes/FontFamilyModal.svelte';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();
  let adding = $state(false);
</script>

<SettingsPageHead title={m.settings_fonts_title()} intro={m.settings_fonts_intro()} error={form?.error?.message ?? null}>
  <Button variant="primary" onclick={() => (adding = true)}>{m.settings_fonts_add_family()}</Button>
</SettingsPageHead>

{#if data.families.length === 0}
  <EmptyState>{m.settings_fonts_empty()}</EmptyState>
{:else}
  {#each data.families as family (family.id)}
    <FontFamilyCard {family} />
  {/each}
{/if}

{#if adding}
  <FontFamilyModal
    open={true}
    onOpenChange={(v) => {
      if (!v) adding = false;
    }}
    error={form?.error?.message ?? null}
    onSaved={() => (adding = false)}
  />
{/if}

