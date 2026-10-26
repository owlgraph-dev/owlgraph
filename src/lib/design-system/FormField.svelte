<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A form field: the label above the control, hint, warning and error below.
  // The control wires itself through formField.ts's context; a raw element takes
  // `id={field.controlId}` and `aria-describedby={field.describedBy}` from the
  // snippet argument. A required field carries only the control's `required`.
  import type { Snippet } from 'svelte';
  import FieldError from './FieldError.svelte';
  import FieldWarning from './FieldWarning.svelte';
  import { setFormFieldContext, type FormFieldContext } from './formField';

  let {
    label,
    hint,
    error = null,
    warning = null,
    optionalLabel,
    group = false,
    for: forId,
    class: className = '',
    children,
  }: {
    label: string;
    /** Help below the control (the format expected, what the value does). */
    hint?: string;
    /** The field's own error; sets the control invalid and describes it. */
    error?: string | null;
    /** A consequence of the value; describes the control without invalidating it. */
    warning?: string | null;
    /** Marks the field optional: the translated "(optional)" after the label. */
    optionalLabel?: string;
    /** Several controls (a radio pair, a picker cluster): label the group. */
    group?: boolean;
    /** The control's id, for a raw element that does not read the context. */
    for?: string;
    class?: string;
    /** The control. Receives the field (controlId, describedBy, invalid) for a
     * raw element to wire itself; design-system controls read it on their own. */
    children: Snippet<[FormFieldContext]>;
  } = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const warningId = `${uid}-warning`;
  const controlId = $derived(group ? undefined : (forId ?? `${uid}-control`));
  const describedBy = $derived([hint ? hintId : null, warning ? warningId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined);

  const field: FormFieldContext = {
    get controlId() { return forId ? undefined : controlId; },
    labelId,
    get describedBy() { return describedBy; },
    get invalid() { return !!error; },
  };
  setFormFieldContext(field);
</script>

<div
  class="ds-form-field {className}"
  role={group ? 'group' : undefined}
  aria-labelledby={group ? labelId : undefined}
  aria-describedby={group ? describedBy : undefined}
>
  {#if group}
    <span class="ds-form-field-label" id={labelId}>{label}{#if optionalLabel}{' '}<span class="ds-form-field-optional">{optionalLabel}</span>{/if}</span>
  {:else}
    <label class="ds-form-field-label" id={labelId} for={controlId}>{label}{#if optionalLabel}{' '}<span class="ds-form-field-optional">{optionalLabel}</span>{/if}</label>
  {/if}
  {@render children(field)}
  {#if hint}<p class="ds-form-field-hint" id={hintId}>{hint}</p>{/if}
  {#if warning}<FieldWarning id={warningId} message={warning} />{/if}
  {#if error}<FieldError id={errorId} message={error} />{/if}
</div>

<style>
  .ds-form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    font-family: var(--ds-font-sans);
  }
  .ds-form-field-label { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .ds-form-field-optional { font-size: var(--ds-text-xs); }
  .ds-form-field-hint {
    margin: 0;
    font-size: var(--ds-text-xs);
    line-height: 1.45;
    color: var(--ds-color-muted);
  }
</style>
