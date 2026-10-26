<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The block Edit dialogs: an html block's markup with its class picker, a
  // diagram's code, a quick link's typed edge, a query block's definition.
  // What they edit and save is blockEdit.svelte.ts's.
  import { listAllCustomStyles } from '$lib/features/content';
  import { QueryBuilderModal } from '$lib/features/query/components';
  import { Dialog, Button, Textarea, Popover, TriggerFace, Command, CommandSearch, CommandList, CommandItem, insertAtCaret, restoreCaret } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import RelationshipDialog from '../blocks/quickLink/RelationshipDialog.svelte';
  import type { PageEditorProps } from '../meta/nodeMeta';
  import type { BlockEdit } from './blockEdit.svelte';

  let {
    edit,
    propSuggestions = [],
    namespaces = [],
    users = [],
    nodeClasses = [],
    tagSuggestions = [],
  }: {
    edit: BlockEdit;
  } & Pick<PageEditorProps, 'propSuggestions' | 'namespaces' | 'users' | 'nodeClasses' | 'tagSuggestions'> = $props();

  let htmlTextareaHost = $state<HTMLDivElement>();
  // Both kinds: an html block may put a block-kind class on its own wrapper.
  const htmlClassOptions = $derived(
    listAllCustomStyles().filter((style) =>
      edit.classQuery.trim() === ''
        ? true
        : `${style.label} ${style.className}`.toLowerCase().includes(edit.classQuery.trim().toLowerCase())
    )
  );

  function insertHtmlClass(className: string): void {
    const field = htmlTextareaHost?.querySelector('textarea') ?? null;
    const next = insertAtCaret(field, edit.value, className);
    edit.value = next.value;
    restoreCaret(field, next.caret);
    edit.classOpen = false;
    edit.classQuery = '';
  }
  // A constant, so Svelte doesn't parse the braces as an expression.
  const htmlParamSyntax = '{{{name}}} / {{{name:type}}}';
</script>

{#if edit.kind === 'html' || edit.kind === 'diagram'}
  <Dialog
    open={!!edit.id}
    onOpenChange={(o) => { if (!o) edit.cancel(); }}
    size="xl"
    title={edit.kind === 'html' ? m.editor_edit_html_title() : m.editor_edit_diagram_title()}
  >
    {#if edit.kind === 'html'}
      <p class="edit-hint">{m.editor_edit_html_hint()}</p>
      {#if edit.htmlInTemplate}
        <p class="edit-hint">{m.editor_edit_html_param_hint_lead()} <code>{htmlParamSyntax}</code>{m.editor_edit_html_param_hint_trail()}</p>
      {/if}
    {:else}
      <p class="edit-hint">{m.editor_edit_diagram_hint_lead()} <code>graph TD; A --&gt; B</code>{m.editor_edit_diagram_hint_trail()}</p>
    {/if}
    <div bind:this={htmlTextareaHost}><Textarea bind:value={edit.value} rows={10} class="edit-textarea" /></div>
    {#if edit.kind === 'html'}
      <!-- Inserts a named style's class at the caret (docs/architecture/custom-styles.md). -->
      <div class="edit-insert">
        <Popover
          bind:open={edit.classOpen}
          side="top"
          align="end"
          triggerProps={{ 'aria-label': m.editor_edit_html_class_insert() }}
        >
          {#snippet trigger()}
            <TriggerFace variant="ghost" size="sm">{m.editor_edit_html_class_insert()}</TriggerFace>
          {/snippet}
          <!-- Filtered here by name and class: Bits UI's filter reads only an item's value. -->
          <Command shouldFilter={false} vimBindings={false} ariaLabel={m.editor_edit_html_class_insert()}>
            <CommandSearch bind:value={edit.classQuery} placeholder={m.editor_edit_html_class_search()} clearLabel={m.editor_edit_html_class_clear()} autofocus />
            <div class="cs-list">
              {#if htmlClassOptions.length === 0}
                <p class="cs-empty">{m.editor_edit_html_class_empty()}</p>
              {/if}
              <CommandList ariaLabel={m.editor_edit_html_class_insert()}>
                {#each htmlClassOptions as style (style.id)}
                  <CommandItem value={style.className} onSelect={() => insertHtmlClass(style.className)}>
                    <span>{style.label}</span>
                    <span class="cs-class">{style.className}</span>
                  </CommandItem>
                {/each}
              </CommandList>
            </div>
          </Command>
        </Popover>
      </div>
    {/if}
    {#snippet footer()}
      <Button variant="secondary" onclick={edit.cancel}>{m.editor_edit_cancel()}</Button>
      <Button variant="primary" onclick={edit.save}>{m.editor_edit_save()}</Button>
    {/snippet}
  </Dialog>
{/if}

{#if edit.kind === 'quickLink' && edit.id && edit.quickLink}
  <RelationshipDialog relationshipType={edit.quickLink.relationshipType} properties={edit.quickLink.properties} onSave={edit.saveQuickLink} onCancel={edit.cancel} />
{/if}

<QueryBuilderModal
  open={!!edit.id && edit.kind === 'query'}
  initialValue={edit.queryDraft}
  params={edit.queryParams}
  propertyOptions={propSuggestions}
  namespaceOptions={namespaces}
  userOptions={users}
  classOptions={nodeClasses}
  {tagSuggestions}
  onSave={edit.saveQuery}
  onCancel={edit.cancel}
/>

<style>
  .edit-insert { display: flex; justify-content: flex-end; margin-top: var(--ds-space-sm); }
  .cs-list { max-height: 16rem; overflow-y: auto; min-width: 14rem; margin-top: var(--ds-space-sm); }
  .cs-empty { margin: 0; padding: var(--ds-space-sm); font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  .cs-class { font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); color: var(--ds-color-muted); }
  .edit-hint { margin: 0 0 0.5rem; font-size: 0.78rem; color: var(--ds-color-muted); }
  :global(.edit-textarea) { min-height: 220px; font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem; }
</style>
