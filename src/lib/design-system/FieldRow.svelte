<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One setting per row in a narrow panel (SettingsRow is the wide-pane twin).
  // Publishes formField.ts's context minus the id: the control inside reads
  // aria-describedby and aria-invalid from it.
  import type { Snippet } from 'svelte';
  import InfoTip from './InfoTip.svelte';
  import FieldError from './FieldError.svelte';
  import FieldWarning from './FieldWarning.svelte';
  import { setFormFieldContext } from './formField';

  let {
    label,
    hint,
    info,
    error = null,
    warning = null,
    layout = 'inline',
    for: forId,
    class: className = '',
    trailing,
    children,
  }: {
    label: string;
    /** The muted resolved or default value after the label. */
    hint?: string;
    /** Help text behind an ⓘ tooltip. */
    info?: string;
    /** The row's own error; sets the control invalid and describes it. */
    error?: string | null;
    /** A consequence of the current value; describes the control without invalidating it. */
    warning?: string | null;
    /** `inline`: a control up to ~120px beside the label; `stack`: a wider one beneath. */
    layout?: 'inline' | 'stack';
    /** Ties the label to one control's id; without it the row is a labelled group. */
    for?: string;
    class?: string;
    /** A small action at the end of the label line. */
    trailing?: Snippet;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
  const errorId = `${uid}-error`;
  const warningId = `${uid}-warning`;
  const describedBy = $derived([error ? errorId : null, warning ? warningId : null].filter(Boolean).join(' ') || undefined);

  // No controlId: the row never hands out an id (a group row holds several
  // controls; a `for` row names its control's own id).
  setFormFieldContext({
    controlId: undefined,
    labelId,
    get describedBy() { return describedBy; },
    get invalid() { return !!error; },
  });
</script>

<div
  class="ds-field-row ds-field-row-{layout} {className}"
  role={forId ? undefined : 'group'}
  aria-labelledby={forId ? undefined : labelId}
  aria-describedby={!forId ? describedBy : undefined}
>
  <div class="ds-field-head">
    {#if forId}
      <label class="ds-field-label" for={forId} id={labelId}>{label}</label>
    {:else}
      <span class="ds-field-label" id={labelId}>{label}</span>
    {/if}
    {#if hint}<span class="ds-field-hint" title={hint}>· {hint}</span>{/if}
    {#if info}<InfoTip text={info} />{/if}
    {#if trailing}<span class="ds-field-trailing">{@render trailing()}</span>{/if}
  </div>
  <div class="ds-field-control">{@render children()}</div>
  {#if error}<div class="ds-field-row-error"><FieldError id={errorId} message={error} /></div>{/if}
  {#if warning}<div class="ds-field-row-warning"><FieldWarning id={warningId} message={warning} /></div>{/if}
</div>

<style>
  .ds-field-row { margin: 0 0 0.55rem; }
  .ds-field-row:last-child { margin-bottom: 0; }
  .ds-field-row-inline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 0.5rem;
    align-items: center;
    min-height: var(--ds-control-h-sm);
  }
  .ds-field-row-stack { display: flex; flex-direction: column; gap: 0.3rem; }
  .ds-field-head { display: flex; align-items: center; gap: 0.3rem; min-width: 0; min-height: 1.4rem; }
  .ds-field-label {
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    color: var(--ds-color-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 1 auto;
    min-width: 0;
  }
  .ds-field-hint {
    font-size: var(--ds-text-xs);
    color: var(--ds-color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
    min-width: 0;
  }
  .ds-field-trailing { display: inline-flex; align-items: center; margin-left: auto; flex: none; }
  .ds-field-row-inline .ds-field-control { display: flex; justify-content: flex-end; align-items: center; min-width: 0; }
  .ds-field-row-stack .ds-field-control { width: 100%; min-width: 0; }
  /* Across both columns of an inline row, under the label and the control. */
  .ds-field-row-inline :is(.ds-field-row-error, .ds-field-row-warning) { grid-column: 1 / -1; margin-top: 0.3rem; }
</style>
