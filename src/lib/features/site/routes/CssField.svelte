<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A CSS editor with the compiler's errors, the soft warnings and a token picker
  // that makes --content-* tokens the easy path (docs/architecture/custom-styles.md).
  import { CodeArea, Popover, TriggerFace, Command, CommandSearch, CommandList, CommandItem, FieldError, FieldWarning, insertAtCaret, restoreCaret } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import { highlightToHtml } from '$lib/features/content';
  import * as m from '$lib/paraglide/messages';
  import type { CssIssue } from '../customStyles/compile';
  import type { StyleWarning } from '../customStyles/warnings';
  import type { ContentToken } from '../customStyles/contentTokens';

  let {
    value = $bindable(''),
    tokens,
    issues = [],
    warnings = [],
    rows = 10,
    name,
    ariaLabel,
    id = 'css-field',
    placeholder,
  }: {
    value?: string;
    tokens: ContentToken[];
    issues?: CssIssue[];
    warnings?: StyleWarning[];
    rows?: number;
    /** Set to post the field in a plain form; the textarea carries it. */
    name?: string;
    ariaLabel?: string;
    id?: string;
    placeholder?: string;
  } = $props();

  const highlight = (source: string) => highlightToHtml(source, 'css');

  let pickerOpen = $state(false);
  let query = $state('');
  let fieldEl = $state<HTMLDivElement>();

  const matches = $derived(
    query.trim() === ''
      ? tokens
      : tokens.filter((token) => `${token.name} ${token.hint}`.toLowerCase().includes(query.trim().toLowerCase()))
  );

  // At the caret, to finish the declaration being written.
  function insert(token: string): void {
    const field = fieldEl?.querySelector('textarea') ?? null;
    const next = insertAtCaret(field, value, `var(${token})`);
    value = next.value;
    restoreCaret(field, next.caret);
    pickerOpen = false;
    query = '';
  }

  function warningText(warning: StyleWarning): string {
    if (warning.kind === 'literal-color') return m.settings_styles_warn_literal_color({ values: warning.values.join(', ') });
    if (warning.kind === 'contrast-pair') return m.settings_styles_warn_contrast_pair({ text: warning.text, background: warning.background });
    if (warning.schemes.length === 2) return m.settings_styles_warn_contrast_scheme_both({ background: warning.background });
    return warning.schemes[0] === 'dark'
      ? m.settings_styles_warn_contrast_scheme_dark({ background: warning.background })
      : m.settings_styles_warn_contrast_scheme_light({ background: warning.background });
  }

  function issueText(issue: CssIssue): string {
    return issue.line === undefined ? issue.message : m.settings_styles_css_error_line({ line: issue.line, message: issue.message });
  }

  // Outside a FormField the field names its messages itself (docs/architecture/design-system/patterns.md, "Where an error goes").
  const describedBy = $derived(
    [...issues.map((_, index) => `${id}-error-${index}`), ...warnings.map((_, index) => `${id}-warning-${index}`)].join(' ') || undefined
  );
</script>

<div class="css-field" bind:this={fieldEl}>
  <CodeArea bind:value {highlight} {name} {rows} {id} {placeholder} {ariaLabel} ariaDescribedby={describedBy} invalid={issues.length > 0} />

  <div class="css-field-foot">
    <Popover
      bind:open={pickerOpen}
      side="bottom"
      align="start"
      triggerProps={{ 'aria-label': m.settings_styles_token_insert() }}
    >
      {#snippet trigger()}
        <TriggerFace variant="ghost" size="sm"><Icon name="plus" size={13} />{m.settings_styles_token_insert()}</TriggerFace>
      {/snippet}
      <!-- Filtered here by name and hint: Bits UI's own filter reads only an item's value. -->
      <Command shouldFilter={false} vimBindings={false} ariaLabel={m.settings_styles_token_insert()}>
        <CommandSearch bind:value={query} placeholder={m.settings_styles_token_search()} clearLabel={m.settings_styles_token_clear()} autofocus />
        <div class="token-list">
          {#if matches.length === 0}
            <p class="token-empty">{m.settings_styles_token_empty()}</p>
          {/if}
          <CommandList ariaLabel={m.settings_styles_token_insert()}>
            {#each matches as token (token.name)}
              <CommandItem value={token.name} onSelect={() => insert(token.name)}>
                <span class="token-name">{token.name}</span>
                <span class="token-hint">{token.hint}</span>
              </CommandItem>
            {/each}
          </CommandList>
        </div>
      </Command>
    </Popover>
  </div>

  {#each issues as issue, index (index)}
    <FieldError id={`${id}-error-${index}`} message={issueText(issue)} />
  {/each}
  {#each warnings as warning, index (index)}
    <FieldWarning id={`${id}-warning-${index}`} message={warningText(warning)} />
  {/each}
</div>

<style>
  .css-field { display: grid; gap: 0.35rem; }
  .css-field-foot { display: flex; justify-content: flex-end; }
  .token-list { max-height: 18rem; overflow-y: auto; margin-top: var(--ds-space-sm); }
  .token-empty {
    margin: 0;
    padding: var(--ds-space-sm);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
  }
  .token-name { font-family: var(--ds-font-mono); font-size: var(--ds-text-sm); }
  .token-hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
</style>
