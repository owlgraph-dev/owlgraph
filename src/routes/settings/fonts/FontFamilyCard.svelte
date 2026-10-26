<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button, EmptyState, Select } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  type Variant = { id: string; weight: number; style: 'normal' | 'italic'; url: string };
  type Family = { id: string; name: string; variants: Variant[] };

  let { family }: { family: Family } = $props();

  const WEIGHT_OPTS: [number, () => string][] = [
    [100, m.settings_fonts_weight_100],
    [200, m.settings_fonts_weight_200],
    [300, m.settings_fonts_weight_300],
    [400, m.settings_fonts_weight_400],
    [500, m.settings_fonts_weight_500],
    [600, m.settings_fonts_weight_600],
    [700, m.settings_fonts_weight_700],
    [800, m.settings_fonts_weight_800],
    [900, m.settings_fonts_weight_900],
  ];

  let weight = $state('400');
  let style = $state('normal');
  let fileInput: HTMLInputElement | undefined = $state();
  let uploading = $state(false);
</script>

<div class="family">
  <div class="family-head">
    <h3>{family.name}</h3>
    <form method="POST" action="?/removeFamily" use:enhance class="inline">
      <input type="hidden" name="familyId" value={family.id} />
      <Button type="submit" variant="ghost-danger" size="sm">{m.settings_fonts_remove_family()}</Button>
    </form>
  </div>

  {#if family.variants.length === 0}
    <div class="empty"><EmptyState size="sm">{m.settings_fonts_variant_empty()}</EmptyState></div>
  {:else}
    <ul class="variants">
      {#each family.variants as v (v.id)}
        <li>
          <span class="variant-label">{v.weight} · {v.style === 'italic' ? m.settings_fonts_style_italic() : m.settings_fonts_style_normal()}</span>
          <form method="POST" action="?/removeVariant" use:enhance class="inline">
            <input type="hidden" name="variantId" value={v.id} />
            <Button type="submit" variant="ghost-danger" size="sm">{m.settings_fonts_variant_remove()}</Button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}

  <form
    method="POST"
    action="?/addVariant"
    enctype="multipart/form-data"
    use:enhance={() => {
      uploading = true;
      return async ({ update }) => {
        await update();
        uploading = false;
        if (fileInput) fileInput.value = '';
      };
    }}
    class="add-variant"
  >
    <input type="hidden" name="familyId" value={family.id} />
    <Select size="sm" name="weight" items={WEIGHT_OPTS.map(([value, label]) => ({ value: String(value), label: label() }))} bind:value={weight} ariaLabel={m.settings_fonts_variant_weight()} />
    <Select
      size="sm"
      name="style"
      items={[
        { value: 'normal', label: m.settings_fonts_style_normal() },
        { value: 'italic', label: m.settings_fonts_style_italic() },
      ]}
      bind:value={style}
      ariaLabel={m.settings_fonts_variant_style()}
    />
    <input bind:this={fileInput} type="file" name="file" accept=".woff2" required />
    <Button type="submit" size="sm" loading={uploading}>{m.settings_fonts_add_variant()}</Button>
  </form>
</div>

<style>
  .family { padding: 0.8rem 0.9rem; border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-md); margin-bottom: 0.8rem; }
  .family-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); }
  .family-head h3 { margin: 0; font-size: var(--ds-text-md); font-weight: var(--ds-weight-semibold); }
  .inline { display: contents; }
  .empty { margin: 0.6rem 0; }
  .variants { list-style: none; margin: 0.6rem 0; padding: 0; }
  .variants li { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); padding: 0.2rem 0; border-bottom: 1px solid var(--ds-color-border); font-size: var(--ds-text-sm); }
  .variants li:last-child { border-bottom: none; }
  .add-variant { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; }
</style>
