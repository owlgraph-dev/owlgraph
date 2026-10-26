<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A non-dismissable Dialog: an outside click must not lose multi-field edits.
  // Every change commits at once, so there is no draft to cancel and "Done" only
  // closes. The class's slots start collapsed: marking a property in the content
  // is the preferred way (docs/architecture/semantic-layer.md).
  import { Dialog, Input, Button, Combobox, Accordion, AccordionItem, Alert, Select } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import NodeClassField from './NodeClassField.svelte';
  import { NodeLocaleField } from '$lib/features/nodes/components';
  import ClassFieldsPanel from './ClassFieldsPanel.svelte';
  import * as m from '$lib/paraglide/messages';
  import { DEFAULT_PROPERTY_GROUP, classPropertySlots, type PropertyDefinitionLike } from '../propertyGroups';
  import type { NodeClassOption, ClassFieldGroup } from '../nodeClass';

  let {
    pageProperties = [],
    manualProperties = [],
    onSetManualProperties,
    propSuggestions = [],
    propertyGroups = [],
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
    locale,
    onSetLocale,
    classDefinitions = [],
    classGroups = [],
    showClassSlots = true,
    open = $bindable(false),
  }: {
    pageProperties?: { name: string; value: string }[];
    // The FULL page-wide list (the dialog does the class split itself).
    manualProperties?: { name: string; value: string }[];
    onSetManualProperties?: (props: { name: string; value: string }[]) => void;
    propSuggestions?: { name: string; label: string; datatype: string }[];
    propertyGroups?: { slug: string; label: string; description: string }[];
    // Without onSetNodeClass, no class selector.
    nodeClassId?: string | null;
    nodeClasses?: NodeClassOption[];
    onSetNodeClass?: (id: string | null) => Promise<{ ok: boolean; error?: string } | undefined>;
    // The content language (docs/architecture/languages.md); without onSetLocale, no selector.
    locale?: string;
    onSetLocale?: (locale: string) => Promise<{ ok: boolean; error?: string }>;
    // The class chain's definitions and their groups, nearest first.
    classDefinitions?: PropertyDefinitionLike[];
    classGroups?: ClassFieldGroup[];
    // Off in the document editor, whose canvas shows the slots already.
    showClassSlots?: boolean;
    open?: boolean;
  } = $props();

  const model = $derived(classPropertySlots(classDefinitions, manualProperties, pageProperties));
  const slots = $derived(showClassSlots ? model.slots : []);
  const conflictFor = $derived(new Map(model.conflicts.map((c) => [c.name, c])));
  const definitionNames = $derived(new Set(classDefinitions.map((d) => d.name)));

  // Collapsed by default; collapses again whenever the class changes.
  let classFieldsOpen = $state<string[]>([]);
  $effect(() => {
    nodeClassId; // track
    classFieldsOpen = [];
  });

  function setSlot(name: string, value: string) {
    const next = manualProperties.filter((p) => p.name !== name);
    if (value.trim()) next.push({ name, value: value.trim() });
    onSetManualProperties?.(next);
  }
  function removeManualByName(name: string) {
    onSetManualProperties?.(manualProperties.filter((p) => p.name !== name));
  }

  let newPropNamespace = $state(DEFAULT_PROPERTY_GROUP);
  let newPropName = $state('');
  let newPropValue = $state('');
  function addManualProp() {
    const localName = newPropName.trim();
    const value = newPropValue.trim();
    if (!localName) return;
    const name = `${newPropNamespace}:${localName}`;
    newPropName = '';
    newPropValue = '';
    // A class definition typed by hand sets its slot instead of duplicating it.
    if (definitionNames.has(name)) {
      setSlot(name, value);
      return;
    }
    onSetManualProperties?.([...manualProperties, { name, value }]);
  }
  function removeFree(row: { name: string; value: string }) {
    onSetManualProperties?.(manualProperties.filter((p) => !(p.name === row.name && p.value === row.value)));
  }

  // Literal kept in a constant so Svelte doesn't parse the braces as an expression.
  const propSyntax = '{{{name:value}}}';

  const propLabels = $derived(new Map(propSuggestions.filter((s) => s.label).map((s) => [s.name, s.label])));
  function labelOf(name: string): string {
    return propLabels.get(name) ?? name;
  }
  // Without the namespace prefix, which the select carries; class definitions
  // have a slot already, so they aren't suggested.
  const propNameOptions = $derived(
    propSuggestions
      .filter((s) => s.name.startsWith(`${newPropNamespace}:`) && !definitionNames.has(s.name))
      .map((s) => s.name.slice(newPropNamespace.length + 1))
  );
</script>

<Dialog {open} onOpenChange={(o) => (open = o)} size="md" title={m.editor_properties_dialog_title()}>
  {#if onSetNodeClass}
    <NodeClassField {nodeClassId} {nodeClasses} {onSetNodeClass} />
  {/if}
  {#if onSetLocale && locale}
    <NodeLocaleField {locale} {onSetLocale} />
  {/if}

  {#if slots.length > 0}
    <Accordion bind:value={classFieldsOpen} class="class-fields-accordion">
      <AccordionItem value="class-fields" size="sm" title={m.editor_properties_class_fields_title({ count: slots.length })}>
        <p class="prop-hint class-fields-hint">{m.editor_properties_class_fields_hint()}</p>
        <ClassFieldsPanel heading={false} layout="stack" {slots} groups={classGroups} ownClassId={nodeClassId} onSetField={setSlot} />
      </AccordionItem>
    </Accordion>
  {/if}

  <p class="prop-label">{m.editor_properties_from_content()}</p>
  {#if pageProperties.length === 0}
    <p class="prop-hint">{m.editor_properties_empty_hint_lead()} <strong>{'{ }'}</strong> {m.editor_properties_empty_hint_mid()} <code>{propSyntax}</code> {m.editor_properties_empty_hint_trail()}</p>
  {:else}
    <ul class="attr-list">
      {#each pageProperties as a, i (i)}
        <li>
          <span class="attr-key">{labelOf(a.name)}</span><span class="attr-val">{a.value}</span>
        </li>
        {#if conflictFor.has(a.name) && pageProperties.findIndex((p) => p.name === a.name) === i}
          <li class="attr-conflict">
            <Alert tone="warning">
              {m.editor_properties_conflict_warning({ value: conflictFor.get(a.name)!.manualValue })}
              {#snippet actions()}
                <Button size="sm" variant="ghost" onclick={() => removeManualByName(a.name)}>{m.editor_properties_conflict_remove()}</Button>
              {/snippet}
            </Alert>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}

  <p class="prop-label" style="margin-top:0.8rem">{m.editor_properties_page_level()}</p>
  {#if model.free.length > 0}
    <ul class="attr-list">
      {#each model.free as a (a.name + ' ' + a.value)}
        <li>
          <span class="attr-key">{labelOf(a.name)}</span><span class="attr-val">{a.value}</span>
          <span class="attr-rm"><Button variant="ghost" size="sm" icon title={m.editor_properties_remove()} aria-label={m.editor_properties_remove_named({ name: a.name })} onclick={() => removeFree(a)}><Icon name="x" size={12} /></Button></span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="attr-add">
    <Select
      items={propertyGroups.map((g) => ({ value: g.slug, label: g.label }))}
      value={newPropNamespace}
      ariaLabel={m.editor_property_picker_group_aria()}
      onValueChange={(v) => (newPropNamespace = v)}
    />
    <Combobox class="attr-in" placeholder={m.editor_properties_name_placeholder()} options={propNameOptions} value={newPropName} onValueChange={(v) => (newPropName = v ?? '')} --combo-width="100%" />
    <Input class="attr-in" placeholder={m.editor_properties_value_placeholder()} bind:value={newPropValue} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addManualProp(); } }} />
    <Button icon onclick={addManualProp} title={m.editor_properties_add()} aria-label={m.editor_properties_add()}><Icon name="plus" size={14} /></Button>
  </div>
  <p class="prop-hint">{m.editor_properties_hint()}</p>

  {#snippet footer()}
    <Button variant="primary" onclick={() => (open = false)}>{m.editor_properties_dialog_done()}</Button>
  {/snippet}
</Dialog>

<style>
  .prop-label { font-size: 0.78rem; color: var(--ds-color-muted); margin: 0 0 0.4rem; }
  .prop-hint { font-size: var(--ds-text-xs); color: var(--ds-color-muted); margin: 0.5rem 0 0; }
  .prop-hint code { background: var(--ds-color-well); padding: 0.05em 0.3em; border-radius: var(--ds-radius-sm); }
  :global(.ds-accordion.class-fields-accordion) { margin: 0 0 0.9rem; }
  .class-fields-hint { margin: 0 0 0.5rem; }
  .attr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .attr-list li { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.85rem; }
  .attr-key { color: var(--ds-color-property); font-weight: var(--ds-weight-semibold); flex: 0 0 auto; }
  .attr-key::after { content: ':'; color: var(--ds-color-muted); }
  .attr-val { color: var(--ds-color-fg); overflow-wrap: anywhere; }
  .attr-list li { align-items: center; }
  .attr-rm { margin-left: auto; display: inline-flex; }
  .attr-list li.attr-conflict { display: block; }
  .attr-add { display: flex; gap: 0.3rem; margin-top: 0.4rem; }
  .attr-add :global(.attr-in) { min-width: 0; flex: 1; }
</style>
