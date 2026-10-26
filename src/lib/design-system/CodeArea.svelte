<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A transparent-text textarea over a highlighted <pre>, the two sharing every
  // layout metric and the scroll; a textarea keeps native editing, undo and a11y.
  // `highlight` comes from the consumer, so the design system carries no
  // grammars. The ground is dark in both schemes: the .hljs-* palette is dark.
  import { getFormFieldContext } from './formField';
  import { esc } from '$lib/platform/htmlEscape';

  let {
    value = $bindable(''),
    highlight,
    name,
    rows = 12,
    disabled = false,
    placeholder,
    invalid = false,
    ariaLabel,
    ariaDescribedby,
    id,
    class: className = '',
    onValueChange,
  }: {
    value?: string;
    /** Source to highlighted markup. It MUST escape the text (`highlightToHtml`
     * does): the result is rendered as HTML. */
    highlight?: (source: string) => string;
    /** On the textarea itself, not a hidden mirror, so the form posts before hydration. */
    name?: string;
    rows?: number;
    disabled?: boolean;
    placeholder?: string;
    invalid?: boolean;
    ariaLabel?: string;
    /** Ids of error/warning text outside a FormField. */
    ariaDescribedby?: string;
    id?: string;
    class?: string;
    onValueChange?: (value: string) => void;
  } = $props();

  const field = getFormFieldContext();
  const controlId = $derived(id ?? field?.controlId);
  const isInvalid = $derived(invalid || (field?.invalid ?? false));

  let textarea = $state<HTMLTextAreaElement>();
  let pre = $state<HTMLPreElement>();

  // A trailing newline has no box of its own, so the <pre> would be one line
  // shorter than the textarea and scroll would drift on the last line.
  const source = $derived(value.endsWith('\n') ? `${value} ` : value);
  const markup = $derived(source === '' ? '' : (highlight?.(source) ?? esc(source)));

  function syncScroll(): void {
    if (!textarea || !pre) return;
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  }

  // Tab moves focus, not indents: an indent would trap the keyboard, and the
  // usual release, Escape, closes the surrounding Dialog with the edit.
</script>

<div class="ds-codearea {className}" class:ds-codearea-invalid={isInvalid} class:ds-codearea-disabled={disabled}>
  <pre bind:this={pre} class="ds-codearea-highlight" aria-hidden="true"><code>{@html markup}</code></pre>
  <textarea
    bind:this={textarea}
    bind:value
    oninput={() => onValueChange?.(value)}
    onscroll={syncScroll}
    {name}
    {rows}
    {disabled}
    {placeholder}
    id={controlId}
    aria-label={ariaLabel}
    aria-describedby={ariaDescribedby ?? field?.describedBy}
    aria-invalid={isInvalid ? 'true' : undefined}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    wrap="off"
  ></textarea>
</div>

<style>
  /* Every glyph metric is set once here and inherited by both layers. The
     textarea alone is in flow, so it sizes the box (`rows` or the resize handle). */
  .ds-codearea {
    position: relative;
    display: block;
    box-sizing: border-box;
    font-family: var(--ds-font-mono);
    font-size: var(--ds-text-field-sm);
    line-height: 1.5;
    tab-size: 2;
    color: var(--ds-code-fg);
    background: var(--ds-code-bg);
    /* Dark in both schemes, so the native scrollbars are too. */
    color-scheme: dark;
    border: 1px solid var(--ds-code-border);
    border-radius: var(--ds-radius-sm);
    overflow: hidden;
  }
  .ds-codearea:not(.ds-codearea-disabled):not(.ds-codearea-invalid):hover { border-color: var(--ds-color-border-hover); }
  .ds-codearea-invalid { border-color: var(--ds-color-danger); }
  /* Disabled dims the layers, not the frame: a dimmed frame would grey the
     dark ground under the syntax colours. */
  .ds-codearea-disabled .ds-codearea-highlight,
  .ds-codearea-disabled textarea { opacity: var(--ds-opacity-disabled); }

  /* Absolute: in flow it would make the box as tall as the code and have no
     overflow of its own, which breaks the scroll sync. */
  .ds-codearea-highlight {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0.5rem 0.6rem;
    box-sizing: border-box;
    overflow: hidden;
    white-space: pre;
    pointer-events: none;
    font: inherit;
    tab-size: inherit;
  }
  .ds-codearea-highlight :global(code) {
    font: inherit;
    background: none;
    padding: 0;
  }

  .ds-codearea textarea {
    /* Above the highlight with transparent text: only the caret and the
       selection paint from here. */
    position: relative;
    z-index: 1;
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 0.5rem 0.6rem;
    border: 0;
    /* The wrapper is the frame, so the ring is pulled inside it
       (docs/architecture/design-system/tokens.md#focus-and-selection-rings). */
    outline-offset: -2px;
    resize: vertical;
    overflow: auto;
    white-space: pre;
    font: inherit;
    tab-size: inherit;
    color: transparent;
    background: transparent;
    caret-color: var(--ds-code-fg);
  }
  .ds-codearea textarea::placeholder { color: var(--ds-code-fg); opacity: 0.55; }
  .ds-codearea textarea::selection { background: color-mix(in srgb, var(--ds-code-fg) 30%, transparent); }
</style>
