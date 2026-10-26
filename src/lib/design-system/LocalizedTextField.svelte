<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script module lang="ts">
  /** One language a LocalizedTextField offers: its code (the input posts
   * `<name>.<code>`), its display name, and whether it must be filled. */
  export type LocalizedTextLocale = { code: string; label: string; required?: boolean };
</script>

<script lang="ts">
  // One text per language (docs/architecture/languages.md) on one row: [language ▾] [input]; the
  // field holds the whole map, so switching never loses an edit. Every language,
  // offered or not, keeps a real input posting `<name>.<code>`, hidden unless
  // edited. No native `required`: a hidden input can't show it, so the consumer
  // gates saving and the server refuses.
  import FormField from './FormField.svelte';
  import Input from './Input.svelte';
  import Textarea from './Textarea.svelte';
  import Select from './Select.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';

  let {
    label,
    hint,
    error = null,
    optionalLabel,
    name,
    locales,
    value = $bindable({}),
    onValueChange,
    multiline = false,
    rows = 3,
    placeholder,
    disabled = false,
    autofocus = false,
    languageLabel,
    missingLabel,
    requiredLabel,
    progressLabel,
    copyFrom,
    copyLabel,
    preservedNote,
    class: className = '',
  }: {
    label: string;
    hint?: string;
    /** The field's own error; turns the select to the required language. */
    error?: string | null;
    /** Marks the whole field optional (no language required). */
    optionalLabel?: string;
    /** The field's form name; each input posts `<name>.<code>`. */
    name: string;
    /** The languages to edit, in display order (the author's own first). */
    locales: readonly LocalizedTextLocale[];
    /** One string per language code; an absent or blank one is untranslated. */
    value?: Record<string, string | undefined>;
    onValueChange?: (value: Record<string, string | undefined>) => void;
    /** A Textarea instead of an Input (a description). */
    multiline?: boolean;
    rows?: number;
    placeholder?: string;
    disabled?: boolean;
    /** Focuses the input on mount. */
    autofocus?: boolean;
    /** The language select's name ("Language"); the select is called "<label>: <languageLabel>". */
    languageLabel: string;
    /** An untranslated language's state in the select ("missing"). */
    missingLabel: string;
    /** The required language's marker in the select ("required"). */
    requiredLabel: string;
    /** The gap Badge's text, e.g. "1/2 translated". */
    progressLabel: (filled: number, total: number) => string;
    /** A language whose text may be copied into an empty one (the common fallback). */
    copyFrom?: string;
    /** The copy button's label ("Copy from English"). */
    copyLabel?: string;
    /** Said when the value holds text in a language not offered (a disabled one), which is kept. */
    preservedNote?: string;
    class?: string;
  } = $props();

  const uid = $props.id();

  const filled = (code: string) => !!value[code]?.trim();
  const anyRequired = $derived(locales.some((l) => l.required));
  const anyFilled = $derived(locales.some((l) => filled(l.code)));
  const isMissing = (l: LocalizedTextLocale) => !filled(l.code) && (l.required || anyFilled || anyRequired);
  const missing = $derived(locales.filter(isMissing));
  const filledCount = $derived(locales.filter((l) => filled(l.code)).length);
  const offered = $derived(new Set(locales.map((l) => l.code)));
  // Text in languages not offered: posted hidden, kept on save.
  const preserved = $derived(Object.keys(value).filter((code) => !offered.has(code) && filled(code)));

  // The required language while it is empty (saving needs it), else the first.
  let current = $state(
    untrack(() => {
      const required = locales.find((l) => l.required && !filled(l.code));
      return (required ?? locales[0])?.code ?? '';
    })
  );
  $effect(() => {
    if (!error) return;
    const required = untrack(() => locales.find((l) => l.required));
    if (required) current = required.code;
  });

  const items = $derived(locales.map((l) => ({ value: l.code, label: l.label })));
  const canCopy = $derived(!!copyFrom && !!copyLabel && current !== copyFrom && !filled(current) && filled(copyFrom));

  function update(code: string, text: string) {
    value = { ...value, [code]: text };
    onValueChange?.(value);
  }
</script>

{#snippet state(code: string)}
  {@const locale = locales.find((l) => l.code === code)}
  {#if locale?.required}<Badge>{requiredLabel}</Badge>{/if}
  {#if filled(code)}
    <span class="ds-ltf-filled"><Icon name="check" size={14} /></span>
  {:else if locale && isMissing(locale)}
    <Badge tone="warning">{missingLabel}</Badge>
  {/if}
{/snippet}

<FormField {label} {hint} {error} {optionalLabel} group class={className}>
  <div class="ds-ltf" class:ds-ltf-multiline={multiline}>
    <div class="ds-ltf-row">
      <Select {items} bind:value={current} ariaLabel={`${label}: ${languageLabel}`} trailing={state} {disabled} />
      <div class="ds-ltf-inputs">
        {#each [...locales.map((l) => l.code), ...preserved] as code (code)}
          {@const shown = code === current}
          {@const name_ = locales.find((l) => l.code === code)?.label ?? code}
          <div class="ds-ltf-input" hidden={!shown}>
            {#if multiline}
              <Textarea
                name="{name}.{code}"
                value={value[code] ?? ''}
                oninput={(e: Event) => update(code, (e.currentTarget as HTMLTextAreaElement).value)}
                {rows}
                {placeholder}
                {disabled}
                aria-label="{label} {name_}"
                aria-invalid={error && shown && !filled(code) ? 'true' : undefined}
              />
            {:else}
              <Input
                name="{name}.{code}"
                value={value[code] ?? ''}
                oninput={(e: Event) => update(code, (e.currentTarget as HTMLInputElement).value)}
                {placeholder}
                {disabled}
                autofocus={autofocus && shown}
                aria-label="{label} {name_}"
                aria-invalid={error && shown && !filled(code) ? 'true' : undefined}
              />
            {/if}
          </div>
        {/each}
      </div>
      {#if missing.length > 0}
        <span class="ds-ltf-progress" id="{uid}-progress" title={missing.map((l) => l.label).join(', ')}>
          <Badge tone="warning">{progressLabel(filledCount, locales.length)}</Badge>
        </span>
      {/if}
    </div>
    {#if canCopy}
      <div class="ds-ltf-copy">
        <Button type="button" variant="ghost" size="sm" onclick={() => update(current, value[copyFrom!] ?? '')}>{copyLabel}</Button>
      </div>
    {/if}
    {#if preserved.length > 0 && preservedNote}<p class="ds-ltf-note">{preservedNote}</p>{/if}
  </div>
</FormField>

<style>
  .ds-ltf { display: flex; flex-direction: column; gap: 0.25rem; }
  .ds-ltf-row { display: flex; align-items: center; gap: var(--ds-space-sm); min-width: 0; }
  .ds-ltf-multiline .ds-ltf-row { align-items: flex-start; }
  .ds-ltf-inputs { flex: 1 1 auto; min-width: 0; }
  .ds-ltf-progress { display: inline-flex; flex: none; }
  .ds-ltf-multiline .ds-ltf-progress { padding-top: 0.45rem; }
  .ds-ltf-filled { display: inline-flex; color: var(--ds-color-success); }
  .ds-ltf-copy { display: flex; }
  .ds-ltf-note { margin: 0; font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
</style>
