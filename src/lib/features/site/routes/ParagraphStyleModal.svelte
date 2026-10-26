<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Add/edit one paragraph style (docs/architecture/typography.md); initial values are a
  // one-time snapshot, since the page remounts this per open. The tag is chosen
  // once: a heading's level is its tag, so a changed tag would disagree with
  // every block using the style.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Select, Alert, FormField } from '$lib/design-system';
  import { PARAGRAPH_STYLE_TAGS, headingLevelOf, type ParagraphStyle, type ParagraphStyleTag } from '$lib/features/content';
  import { LocalizedField } from '$lib/features/semantic/components';
  import { siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
  import * as m from '$lib/paraglide/messages';

  let {
    open,
    onOpenChange,
    mode,
    style,
    tokens,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    style: ParagraphStyle | null;
    tokens: { id: string; name: string }[];
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'paragraph-style-form';
  // Select has no empty item: "no token" is a sentinel posted as ''.
  const NONE = '__default__';

  let label = $state<Record<string, string | undefined>>(untrack(() => ({ ...style?.label })));
  let renderAs = $state<ParagraphStyleTag>(untrack(() => style?.renderAs ?? 'p'));
  let tokenId = $state(untrack(() => style?.tokenId ?? NONE));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_branding_paragraph_styles_new_title() : m.settings_branding_paragraph_styles_edit_title());
  const tagItems = $derived(PARAGRAPH_STYLE_TAGS.map((tag) => ({ value: tag, label: tagLabel(tag) })));
  const tokenItems = $derived([{ value: NONE, label: m.settings_branding_typography_unbranded() }, ...tokens.map((t) => ({ value: t.id, label: t.name }))]);

  function tagLabel(tag: ParagraphStyleTag): string {
    const level = headingLevelOf(tag);
    return level == null ? m.settings_branding_paragraph_styles_tag_p() : m.settings_branding_paragraph_styles_tag_h({ level });
  }
</script>

<Dialog {open} {onOpenChange} size="md" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? '?/createParagraphStyle' : '?/updateParagraphStyle'}
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if mode === 'edit' && style}<input type="hidden" name="id" value={style.id} />{/if}

    <LocalizedField label={m.settings_branding_paragraph_styles_label_label()} name="label" required bind:value={label} placeholder={m.settings_branding_paragraph_styles_label_placeholder()} autofocus />

    {#if mode === 'create'}
      <FormField label={m.settings_branding_paragraph_styles_render_as_label()} hint={m.settings_branding_paragraph_styles_render_as_hint()}>
        <Select items={tagItems} value={renderAs} onValueChange={(v) => (renderAs = v as ParagraphStyleTag)} width="full" />
        <input type="hidden" name="renderAs" value={renderAs} />
      </FormField>
    {:else}
      <FormField label={m.settings_branding_paragraph_styles_render_as_label()} hint={m.settings_branding_paragraph_styles_render_as_fixed_hint()} group>
        <p class="tag">{tagLabel(renderAs)}</p>
      </FormField>
    {/if}

    <FormField label={m.settings_branding_paragraph_styles_token_label()} hint={m.settings_branding_paragraph_styles_token_hint()}>
      <Select items={tokenItems} value={tokenId} onValueChange={(v) => (tokenId = v)} width="full" />
      <input type="hidden" name="tokenId" value={tokenId === NONE ? '' : tokenId} />
    </FormField>

    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!label[siteDefaultLocale()]?.trim()}>{m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .tag { margin: 0; font-size: var(--ds-text-sm); }
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
