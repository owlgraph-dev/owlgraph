<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The class is derived from the label at creation and fixed after
  // (docs/architecture/custom-styles.md). Errors and warnings come from the server's own
  // modules, loaded on demand (customStyles/load.ts) to keep postcss off other
  // pages; the server stays the authority.
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { Dialog, Button, Input, Select, Alert, FormField } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { styleClass } from '../customStyles/slug';
  import { loadCustomStyleTools, type CustomStyleTools } from '../customStyles/load';
  import type { CssIssue } from '../customStyles/compile';
  import type { ContentToken } from '../customStyles/contentTokens';
  import type { CustomStyleRow, StyleKind } from '../types';
  import CssField from './CssField.svelte';

  let {
    open,
    onOpenChange,
    mode,
    style,
    previewSlug,
    tokens,
    error,
    onSaved,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    style: CustomStyleRow | null;
    /** What the class would be for a new style, given the label typed so far. */
    previewSlug: (label: string) => string;
    tokens: ContentToken[];
    error: string | null;
    onSaved: () => void;
  } = $props();

  const formId = 'custom-style-form';

  let label = $state(untrack(() => style?.label ?? ''));
  let kind = $state<StyleKind>(untrack(() => style?.kind ?? 'inline'));
  let css = $state(untrack(() => style?.css ?? ''));
  let submitted = $state(false);

  const title = $derived(mode === 'create' ? m.settings_styles_style_new_title() : m.settings_styles_style_edit_title());
  const kindItems = $derived([
    { value: 'inline', label: m.settings_styles_style_kind_inline() },
    { value: 'block', label: m.settings_styles_style_kind_block() },
  ]);

  // A new style shows the class it would get before it becomes permanent.
  const slug = $derived(style ? style.slug : previewSlug(label));

  let tools = $state<CustomStyleTools | null>(null);
  $effect(() => {
    void loadCustomStyleTools().then((loaded) => (tools = loaded));
  });

  // Compiled against the slug it will carry, so an error here is the save's.
  const issues = $derived<CssIssue[]>(tools ? tools.compileStyleCss(css, slug || 'stil').issues : []);
  const warnings = $derived(tools && issues.length === 0 ? tools.styleWarnings(css, kind) : []);

  const canSave = $derived(!!label.trim() && issues.length === 0);
</script>

<Dialog {open} {onOpenChange} size="lg" {title}>
  <form
    id={formId}
    method="POST"
    action={mode === 'create' ? '?/createStyle' : '?/updateStyle'}
    use:enhance={() => {
      submitted = true;
      return async ({ result, update }) => {
        await update({ reset: false });
        if (result.type === 'success') onSaved();
      };
    }}
  >
    {#if mode === 'edit' && style}<input type="hidden" name="id" value={style.id} />{/if}

    <div class="field-grid">
      <FormField label={m.settings_styles_style_label()} hint={m.settings_styles_style_label_hint()}>
        <Input name="label" bind:value={label} placeholder={m.settings_styles_style_label_placeholder()} required autofocus />
      </FormField>
      <FormField label={m.settings_styles_style_kind_label()} hint={m.settings_styles_style_kind_hint()}>
        <Select items={kindItems} value={kind} onValueChange={(v) => (kind = v as StyleKind)} width="full" />
        <input type="hidden" name="kind" value={kind} />
      </FormField>
    </div>

    <FormField
      label={m.settings_styles_style_slug_label()}
      hint={mode === 'create' ? m.settings_styles_style_slug_new_hint() : m.settings_styles_style_slug_hint()}
      group
    >
      <p class="slug">{styleClass(slug || 'stil')}</p>
    </FormField>

    <FormField label={m.settings_styles_style_css_label()} hint={m.settings_styles_style_css_hint()} group>
      <CssField
        bind:value={css}
        name="css"
        id="custom-style-css"
        {tokens}
        {issues}
        {warnings}
        rows={10}
        ariaLabel={m.settings_styles_style_css_label()}
      />
    </FormField>

    {#if submitted && error}<div class="form-alert"><Alert tone="danger">{error}</Alert></div>{/if}
  </form>

  {#snippet footer()}
    <Button type="button" onclick={() => onOpenChange(false)}>{m.settings_cancel()}</Button>
    <Button type="submit" form={formId} variant="primary" disabled={!canSave}>{m.settings_save()}</Button>
  {/snippet}
</Dialog>

<style>
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm) var(--ds-space-md); }
  .slug {
    margin: 0;
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .form-alert { margin-top: var(--ds-space-sm); }
</style>
