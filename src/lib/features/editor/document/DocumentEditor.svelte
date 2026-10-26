<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The page editor's node chrome without EditorCore: a document has no block
  // canvas and takes no edit lock. Its commits are last-write-wins, like the
  // header's and the access panel's on a page.
  import { untrack } from 'svelte';
  import EditorHeader from '../meta/EditorHeader.svelte';
  import { MetaMirror } from '../meta/metaMirror.svelte';
  import { DeleteRequest } from '../meta/deleteRequest.svelte';
  import type { DocumentEditorProps } from '../meta/nodeMeta';
  import { AccessControlPanel } from '$lib/features/nodes/components';
  import { PagePropertiesDialog } from '$lib/features/semantic/components';
  import { ClassFieldsPanel } from '$lib/features/semantic/components';
  import DeleteDocumentModal from './DeleteDocumentModal.svelte';
  import DocumentSourcePanel from './DocumentSourcePanel.svelte';
  import { classPropertySlots } from '$lib/features/semantic';
  import type { ClassFields, NodeClassOption } from '$lib/features/semantic';
  import { Alert, Button } from '$lib/design-system';
  import { getLocale } from '$lib/paraglide/runtime';
  import { isSupportedLocale } from '$lib/platform/i18n/siteLocales';
  import { localeNameInUi } from '$lib/platform/i18n/localeNames';
  import * as m from '$lib/paraglide/messages';

  let {
    documentId,
    title,
    slug,
    namespaceSlug,
    source,
    plugin,
    externalUrl,
    filename,
    mime,
    size,
    tags,
    onSetTags,
    tagSuggestions = [],
    manualProperties,
    onSetManualProperties,
    propSuggestions = [],
    propertyGroups = [],
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
    locale,
    onSetLocale,
    localeSuggestion = null,
    onDismissLocaleSuggestion,
    classFields = null,
    onRename,
    onReplaceFile,
    onSetLink,
    visibility,
    namespaceAccessLevel,
    namespaceMembers = [],
    shares = [],
    users = [],
    onSetVisibility,
    onSetShares,
    shareLinks = [],
    onCreateShareLink,
    onRevokeShareLink,
    namespaceId,
    namespaces = [],
    onSetNamespace,
    onDelete,
  }: DocumentEditorProps = $props();

  // A detected language, named in the interface's language ("Englisch").
  const suggestionName = (code: string) => (isSupportedLocale(code) ? localeNameInUi(code) : code);

  let moreOpen = $state(false);
  let accessControlOpen = $state(false);
  let tagsPopoverOpen = $state(false);
  let pagePropertiesDialogOpen = $state(false);

  const deletion = new DeleteRequest(() => onDelete);

  const meta = new MetaMirror(untrack(() => ({ tags, manualProperties })), {
    onSetTags: (t) => onSetTags?.(t) ?? Promise.resolve({ ok: false }),
    onSetManualProperties: (props) => onSetManualProperties?.(props) ?? Promise.resolve({ ok: false }),
  });

  // The class's slots render in the canvas, so the dialog hides them. A
  // document has no inline properties, so there are never conflicts.
  const classDefinitions = $derived(classFields?.definitions ?? []);
  const classSlots = $derived(classPropertySlots(classDefinitions, meta.manualProperties).slots);

  function setClassField(name: string, value: string) {
    const next = meta.manualProperties.filter((p) => p.name !== name);
    if (value.trim()) next.push({ name, value: value.trim() });
    meta.commitManualProperties(next);
  }
</script>

<div class="doc-editor">
  <div class="doc-header-bar">
    <EditorHeader
      {title}
      {slug}
      {namespaceSlug}
      {onRename}
      tags={meta.tags}
      onSetTags={meta.commitTags}
      {tagSuggestions}
      bind:accessControlOpen
      bind:moreOpen
      bind:tagsPopoverOpen
      bind:pagePropertiesDialogOpen
      onRequestDelete={deletion.ask}
    />
  </div>

  <div class="doc-body">
    <!-- lang: the document's content language (docs/architecture/languages.md) — its field values are content. -->
    <div class="doc-canvas" lang={locale}>
      <!-- A detected language is offered, never applied until the author takes
           it (docs/architecture/languages.md); chrome, so in the interface's language. -->
      {#if localeSuggestion && localeSuggestion !== locale && onSetLocale}
        <div class="locale-suggestion" lang={getLocale()}>
          <Alert tone="info">
            {m.editor_locale_detected({ language: suggestionName(localeSuggestion) })}
            {#snippet actions()}
              <Button size="sm" variant="primary" onclick={() => onSetLocale(localeSuggestion)}>{m.editor_locale_detected_accept()}</Button>
              <Button size="sm" variant="ghost" onclick={() => onDismissLocaleSuggestion?.()}>{m.editor_locale_detected_dismiss()}</Button>
            {/snippet}
          </Alert>
        </div>
      {/if}
      <DocumentSourcePanel {documentId} {source} {plugin} {externalUrl} {filename} {mime} {size} onReplace={onReplaceFile} {onSetLink} />
      {#if classFields && classFields.definitions.length > 0}
        <ClassFieldsPanel
          groupLabel={classFields.groups.length === 1 ? classFields.groups[0].label : classFields.nodeClass.label}
          slots={classSlots}
          groups={classFields.groups}
          ownClassId={classFields.nodeClass.id}
          onSetField={setClassField}
        />
      {/if}
    </div>
  </div>
</div>

<AccessControlPanel
  open={accessControlOpen}
  {visibility}
  {namespaceAccessLevel}
  {namespaceMembers}
  {shares}
  {users}
  {onSetVisibility}
  {onSetShares}
  {shareLinks}
  {onCreateShareLink}
  {onRevokeShareLink}
  {namespaceId}
  {namespaces}
  {onSetNamespace}
  onClose={() => (accessControlOpen = false)}
/>

<DeleteDocumentModal open={deletion.open} busy={deletion.busy} error={deletion.error} onConfirm={deletion.confirm} onOpenChange={(v) => (deletion.open = v)} />

<PagePropertiesDialog
  bind:open={pagePropertiesDialogOpen}
  pageProperties={[]}
  manualProperties={meta.manualProperties}
  onSetManualProperties={meta.commitManualProperties}
  {propSuggestions}
  {propertyGroups}
  {nodeClassId}
  {nodeClasses}
  {onSetNodeClass}
  {locale}
  {onSetLocale}
  {classDefinitions}
  classGroups={classFields?.groups ?? []}
  showClassSlots={false}
/>

<style>
  .locale-suggestion { margin-bottom: var(--ds-space-md); }
  /* Like DesktopEditor.svelte's frame: fixed to break out of <main>'s centred box,
     the body the full-width scroll owner, the canvas its centred column. */
  .doc-editor { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--ds-color-bg); z-index: 1; }
  .doc-header-bar { flex: 0 0 auto; }
  .doc-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .doc-canvas { max-width: 42rem; margin: 0 auto; padding: 1.5rem; box-sizing: border-box; }
</style>
