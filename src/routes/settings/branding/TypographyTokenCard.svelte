<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Select has no empty item, so "inherit" is a sentinel a hidden input maps
  // back to the empty string the action expects. A size is a step of the type
  // scale (docs/architecture/typography.md); a stored px literal is listed as its own item,
  // so the form posts it back untouched, but no new one can be entered.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Button, Input, Select } from '$lib/design-system';
  import { typeScaleOptions, type TypeSize } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';

  type Token = {
    id: string;
    name: string;
    family: string | null;
    size: TypeSize | null;
    weight: 'normal' | 'medium' | 'semibold' | 'bold' | null;
    lineHeight: number | null;
    letterSpacing: number | null;
  };

  let { token, customFonts }: { token: Token; customFonts: { id: string; name: string }[] } = $props();

  const INHERIT = '__inherit__';
  let family = $state(untrack(() => token.family ?? INHERIT));
  let weight = $state<string>(untrack(() => token.weight ?? INHERIT));
  let size = $state<string>(untrack(() => (token.size == null ? INHERIT : String(token.size))));

  const sizeItems = $derived([
    { value: INHERIT, label: m.settings_branding_typography_inherit() },
    ...typeScaleOptions().map((o) => ({ value: o.value, label: `${o.label} · ${o.hint}` })),
    ...(typeof token.size === 'number' ? [{ value: String(token.size), label: m.settings_branding_typography_size_custom_literal({ value: token.size }) }] : []),
  ]);

  const familyItems = $derived([
    { value: INHERIT, label: m.settings_branding_typography_inherit() },
    { value: 'sans', label: m.settings_branding_typography_font_sans() },
    { value: 'serif', label: m.settings_branding_typography_font_serif() },
    { value: 'mono', label: m.settings_branding_typography_font_mono() },
    ...customFonts.map((f) => ({ value: f.id, label: f.name })),
  ]);
  const weightItems = $derived([
    { value: INHERIT, label: m.settings_branding_typography_inherit() },
    { value: 'normal', label: m.capability_typography_weight_regular() },
    { value: 'medium', label: m.capability_typography_weight_medium() },
    { value: 'semibold', label: m.capability_typography_weight_semibold() },
    { value: 'bold', label: m.capability_typography_weight_bold() },
  ]);
</script>

<div class="token-card">
  <form
    method="POST"
    action="?/updateTypographyToken"
    use:enhance={() => async ({ update }) => { await update({ reset: false }); }}
    class="token-row"
  >
    <input type="hidden" name="id" value={token.id} />
    <input type="hidden" name="family" value={family === INHERIT ? '' : family} />
    <input type="hidden" name="weight" value={weight === INHERIT ? '' : weight} />
    <input type="hidden" name="size" value={size === INHERIT ? '' : size} />
    <span class="token-name"><Input size="sm" name="name" value={token.name} required aria-label={m.settings_branding_typography_token_name()} /></span>
    <Select size="sm" items={familyItems} bind:value={family} ariaLabel={m.settings_branding_typography_token_font()} />
    <Select size="sm" items={sizeItems} bind:value={size} ariaLabel={m.settings_branding_typography_token_size()} />
    <Select size="sm" items={weightItems} bind:value={weight} ariaLabel={m.settings_branding_typography_token_weight()} />
    <span class="token-number"><Input size="sm" type="number" name="lineHeight" min="1" max="3" step="0.1" placeholder={m.settings_branding_typography_token_line_height()} value={token.lineHeight ?? ''} aria-label={m.settings_branding_typography_token_line_height()} /></span>
    <span class="token-number"><Input size="sm" type="number" name="letterSpacing" min="-0.05" max="0.5" step="0.01" placeholder={m.settings_branding_typography_token_letter_spacing()} value={token.letterSpacing ?? ''} aria-label={m.settings_branding_typography_token_letter_spacing()} /></span>
    <Button type="submit" variant="ghost" size="sm">{m.settings_branding_typography_save()}</Button>
  </form>
  <form method="POST" action="?/removeTypographyToken" use:enhance class="inline">
    <input type="hidden" name="id" value={token.id} />
    <Button type="submit" variant="ghost-danger" size="sm">{m.settings_branding_typography_remove_token()}</Button>
  </form>
</div>

<style>
  .token-card { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; padding: 0.5rem 0; border-bottom: 1px solid var(--ds-color-border); }
  .token-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; flex: 1; }
  .token-name { flex: 1 1 10rem; min-width: 8rem; }
  .token-number { width: 5.5rem; }
  .inline { display: contents; }
</style>
