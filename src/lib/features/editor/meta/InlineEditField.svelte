<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Click-to-edit: the caller owns `value` and every word; this owns only the
  // view/edit toggle and the draft. A rejected commit reopens the field with
  // the rejected text, described by the caller's FieldError (`errorId`), and
  // takes focus only when the commit came from Enter, not from a blur.
  import { Button, Input } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';

  let {
    value,
    prefix = '',
    placeholder = '',
    variant = 'slug',
    disabled = false,
    ariaLabel,
    editTitle,
    class: className = '',
    errorId,
    onCommit,
    onError,
  }: {
    value: string;
    prefix?: string;
    /** Shown, muted, in the view button when `value` is empty. */
    placeholder?: string;
    variant?: 'title' | 'slug';
    disabled?: boolean;
    ariaLabel?: string;
    /** Tooltip on the view-state button. */
    editTitle?: string;
    class?: string;
    /** The id of the caller's FieldError, which describes the reopened field. */
    errorId?: string;
    onCommit: (next: string) => Promise<{ ok: boolean; error?: string } | undefined>;
    /** Forwards a commit failure to the caller's error display; null clears it. */
    onError?: (message: string | null) => void;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let invalid = $state(false);
  let focusOnOpen = $state(true);

  function startEdit() {
    if (disabled) return;
    draft = value;
    invalid = false;
    focusOnOpen = true;
    onError?.(null);
    editing = true;
  }

  async function commit(fromKeyboard: boolean) {
    if (!editing) return;
    editing = false;
    const next = draft.trim();
    if (!next || next === value) {
      invalid = false;
      onError?.(null);
      return;
    }
    const res = await onCommit(next);
    if (res?.ok) {
      invalid = false;
      onError?.(null);
      return;
    }
    draft = next;
    invalid = true;
    focusOnOpen = fromKeyboard;
    editing = true;
    onError?.(res?.error ?? null);
  }

  function cancel() {
    editing = false;
    invalid = false;
    onError?.(null);
  }
</script>

{#if editing}
  <span class="field-edit field-edit-{variant} {className}">
    {#if prefix}<span class="field-prefix" class:mono={variant === 'slug'}>{prefix}</span>{/if}
    <Input
      size="sm"
      class="field-input {variant === 'slug' ? 'mono' : ''} {variant === 'title' ? 'field-input-title' : ''}"
      bind:value={draft}
      autofocus={focusOnOpen}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid ? errorId : undefined}
      onblur={() => commit(false)}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
    />
  </span>
{:else}
  <Button
    variant="ghost"
    size="sm"
    class="field-view field-view-{variant} {value ? '' : 'is-placeholder'} {className}"
    onclick={startEdit}
    {disabled}
    title={editTitle}
  >
    {prefix}{value || placeholder}<Icon name="pencil" size={12} />
  </Button>
{/if}

<style>
  .field-edit { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.2rem; min-width: 0; }
  .field-prefix { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .field-prefix.mono { font-family: ui-monospace, Menlo, monospace; }
  :global(.field-input) { min-width: 0; }
  :global(.field-input.mono) { font-family: ui-monospace, Menlo, monospace; }
  :global(.field-input-title) { font-weight: 600; }
  :global(.field-view) { align-self: flex-start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Compound selectors here outrank Button's own same-specificity .ds-btn
     rules whichever stylesheet is injected first. */
  :global(.ds-btn.field-view) { justify-content: flex-start; }
  :global(.field-view.is-placeholder) { opacity: 0.6; font-style: italic; }
  :global(.ds-btn-ghost.field-view-slug) { color: var(--ds-color-muted); font-weight: 400; font-family: ui-monospace, Menlo, monospace; }
  :global(.ds-btn-ghost.field-view-slug):hover { color: var(--ds-color-fg); }
  :global(.ds-btn-ghost.field-view-title) { color: var(--ds-color-fg); font-weight: 600; }
  :global(.ds-btn-sm.field-view-title) { font-size: var(--ds-text-md); }
</style>
