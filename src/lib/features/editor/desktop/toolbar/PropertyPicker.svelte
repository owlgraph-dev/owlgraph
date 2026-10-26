<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The property picker: marks the selected text as a property's value, or,
  // inside a query block's template, as one of its parameters
  // (core/properties.svelte.ts).
  import { Button, Popover, Combobox, Select, FieldError, TriggerFace, Input } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import { DEFAULT_PROPERTY_GROUP, PROPERTY_DATATYPES, isPropertyDatatype } from '$lib/features/semantic';
  import type { EditorCore } from '../../core/editorCore.svelte';
  import { preserveEditorFocusOnClose } from '../keyboard';
  import type { EditorOverlays } from '../overlays.svelte';

  let {
    core,
    overlays,
    propertyGroups = [],
    propSuggestions = [],
    toolbarProps,
  }: {
    core: EditorCore;
    overlays: EditorOverlays;
    propertyGroups?: { slug: string; label: string; description: string }[];
    propSuggestions?: { name: string; label: string; datatype: string }[];
    /** The toolbar button's props: the trigger is one of the toolbar's stops. */
    toolbarProps: Record<string, unknown>;
  } = $props();

  const uid = $props.id();
  const paramNameErrorId = `${uid}-param-name-error`;
  // propGroup stays across opens: the last-used group is the likely next.
  let propName = $state('');
  let propGroup = $state(DEFAULT_PROPERTY_GROUP);
  // Inside a query block's template the same button defines a parameter: a
  // free name and a datatype, no group or suggestions.
  const propMode = $derived<'property' | 'parameter'>(core.selection.chain.some((e) => e.type === 'queryBlock') ? 'parameter' : 'property');
  let paramName = $state('');
  let paramType = $state('text'); // sticky across opens, like propGroup
  let paramNameError = $state('');
  const PARAM_NAME_RE = /^[\w-]+$/; // the server's property NAME_RE

  function openProp() {
    if (!core.editor) return;
    const { from, to } = core.editor.state.selection;
    core.properties.range = { from, to };
    propName = '';
    paramNameError = '';
    if (propMode === 'parameter') {
      // An existing slot is edited in place. A mark in another group (core:x)
      // prefills its local part too; applying moves it to the parameter group.
      const attrs = core.editor.getAttributes('semanticProperty');
      const existing = typeof attrs.propName === 'string' ? attrs.propName : '';
      if (existing) {
        const sep = existing.indexOf(':');
        paramName = sep >= 0 ? existing.slice(sep + 1) : existing;
        if (isPropertyDatatype(attrs.paramType)) paramType = attrs.paramType;
      } else {
        paramName = '';
      }
    }
    overlays.linkPicker = false;
    overlays.propertyPicker = true;
  }
  function closeProp() {
    overlays.propertyPicker = false;
  }
  function applyPropAndClose() {
    if (propMode === 'parameter') {
      const trimmed = paramName.trim();
      if (trimmed && !PARAM_NAME_RE.test(trimmed)) {
        paramNameError = m.editor_parameter_name_invalid();
        return;
      }
      if (trimmed) core.properties.applyParam(trimmed, paramType);
      paramName = '';
      overlays.propertyPicker = false;
      return;
    }
    const trimmed = propName.trim();
    if (trimmed) core.properties.applyProp(`${propGroup}:${trimmed}`);
    propName = '';
    overlays.propertyPicker = false;
  }
</script>

<Popover
  open={overlays.propertyPicker}
  onOpenChange={(o) => { if (o) openProp(); else closeProp(); }}
  onCloseAutoFocus={preserveEditorFocusOnClose}
  side="bottom"
  align="start"
  class="picker attr-pop"
  triggerProps={{
    ...toolbarProps,
    title: propMode === 'parameter' ? m.editor_parameter_picker_title() : m.editor_property_picker_title(),
    'aria-label': propMode === 'parameter' ? m.editor_parameter_picker_aria() : m.editor_property_picker_aria(),
  }}
>
  {#snippet trigger()}
    <TriggerFace variant="toolbar" icon><Icon name="braces" /></TriggerFace>
  {/snippet}
  {#if propMode === 'parameter'}
    <div class="attr-namespace-row">
      <span class="attr-grow">
        <Input
          size="sm"
          placeholder={m.editor_parameter_name_placeholder()}
          aria-label={m.editor_parameter_name_aria()}
          aria-invalid={paramNameError ? 'true' : undefined}
          aria-describedby={paramNameError ? paramNameErrorId : undefined}
          value={paramName}
          oninput={(e: Event) => { paramName = (e.currentTarget as HTMLInputElement).value; paramNameError = ''; }}
          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); applyPropAndClose(); } }}
          autofocus
        />
      </span>
      <span class="attr-namespace-sep">:</span>
      <Select
        size="sm"
        items={PROPERTY_DATATYPES.map((t) => ({ value: t, label: t }))}
        value={paramType}
        ariaLabel={m.editor_parameter_type_aria()}
        onValueChange={(v) => (paramType = v)}
      />
      <Button variant="primary" size="sm" icon title={m.editor_property_picker_apply()} aria-label={m.editor_property_picker_apply()} onclick={applyPropAndClose}><Icon name="check" size={16} /></Button>
    </div>
    {#if paramNameError}<div class="attr-error"><FieldError id={paramNameErrorId} message={paramNameError} /></div>{/if}
    <p class="hint">{m.editor_parameter_picker_hint()}</p>
  {:else}
    <div class="attr-namespace-row">
      <Select
        size="sm"
        items={propertyGroups.map((g) => ({ value: g.slug, label: g.label }))}
        value={propGroup}
        ariaLabel={m.editor_property_picker_group_aria()}
        onValueChange={(v) => (propGroup = v)}
      />
      <span class="attr-namespace-sep">:</span>
      <Combobox
        placeholder={m.editor_property_picker_placeholder()}
        options={propSuggestions.filter((s) => s.name.startsWith(`${propGroup}:`)).map((s) => s.name.slice(propGroup.length + 1))}
        value={propName}
        onValueChange={(v) => (propName = v ?? '')}
        --combo-width="100%"
      />
      <Button variant="primary" size="sm" icon title={m.editor_property_picker_apply()} aria-label={m.editor_property_picker_apply()} onclick={applyPropAndClose}><Icon name="check" size={16} /></Button>
    </div>
    <p class="hint">{m.editor_property_picker_hint()}</p>
  {/if}
</Popover>

<style>
  :global(.ds-popover-content.picker) { width: 280px; max-height: 320px; overflow-y: auto; padding: 0.5rem; }
  /* .picker's overflow would clip the Combobox's suggestion dropdown; both
     classes out-rank the .picker rule. The width fits the name field's
     placeholder beside the select and the button. */
  :global(.ds-popover-content.picker.attr-pop) { max-height: none; overflow: visible; width: 400px; max-width: calc(100vw - 2rem); }
  .attr-namespace-row { display: flex; align-items: center; gap: 0.3rem; }
  .attr-namespace-row :global(.ds-btn) { flex: 0 0 auto; }
  .attr-namespace-sep { color: var(--ds-color-muted); flex: 0 0 auto; }
  .attr-namespace-row :global(.attr-in), .attr-namespace-row { margin-bottom: 0.4rem; }
  .attr-grow { flex: 1 1 auto; min-width: 0; }
  .attr-error { margin: 0 0.2rem 0.4rem; }
</style>
