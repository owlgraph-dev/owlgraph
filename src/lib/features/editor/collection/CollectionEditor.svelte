<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A curated collection's members are arranged here; a mirrored one's come
  // from its integration, so they're listed read-only. A collection has no
  // per-user shares and no share links, so the access panel offers neither.
  import { untrack } from 'svelte';
  import EditorHeader from '../meta/EditorHeader.svelte';
  import { MetaMirror } from '../meta/metaMirror.svelte';
  import { DeleteRequest } from '../meta/deleteRequest.svelte';
  import type { CollectionEditorProps } from '../meta/nodeMeta';
  import { AccessControlPanel } from '$lib/features/nodes/components';
  import { NODE_TYPE_LABEL } from '$lib/features/nodes';
  import { PagePropertiesDialog, ClassFieldsPanel } from '$lib/features/semantic/components';
  import { classPropertySlots } from '$lib/features/semantic';
  import { Alert, Badge, Button } from '$lib/design-system';
  import DeleteCollectionModal from './DeleteCollectionModal.svelte';
  import CollectionConnectModal from './CollectionConnectModal.svelte';
  import MembersEditor from './MembersEditor.svelte';
  import { pickerNamespace } from '$lib/features/search/picker';
  import { formatDateTime } from '$lib/platform/i18n/format';
  import * as m from '$lib/paraglide/messages';

  let {
    title,
    slug,
    namespaceSlug,
    collectionId,
    source = null,
    onSourceConnected,
    members = [],
    membersBasis = '',
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
    classFields = null,
    onRename,
    visibility,
    namespaceAccessLevel,
    namespaceMembers = [],
    onSetVisibility,
    namespaceId,
    namespaces = [],
    onSetNamespace,
    onDelete,
  }: CollectionEditorProps = $props();

  const membersNamespace = $derived(pickerNamespace(namespaces, namespaceId));

  let moreOpen = $state(false);
  let accessControlOpen = $state(false);
  let tagsPopoverOpen = $state(false);
  let pagePropertiesDialogOpen = $state(false);

  let connectOpen = $state(false);
  const deletion = new DeleteRequest(() => onDelete);

  const meta = new MetaMirror(untrack(() => ({ tags, manualProperties: manualProperties ?? [] })), {
    onSetTags: (t) => onSetTags?.(t) ?? Promise.resolve({ ok: false }),
    onSetManualProperties: (props) => onSetManualProperties?.(props) ?? Promise.resolve({ ok: false }),
  });

  const classDefinitions = $derived(classFields?.definitions ?? []);
  const classSlots = $derived(classPropertySlots(classDefinitions, meta.manualProperties).slots);

  function setClassField(name: string, value: string) {
    const next = meta.manualProperties.filter((p) => p.name !== name);
    if (value.trim()) next.push({ name, value: value.trim() });
    meta.commitManualProperties(next);
  }
</script>

<div class="collection-editor">
  <div class="collection-header-bar">
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

  <div class="collection-body">
    <!-- lang: the collection's content language (docs/architecture/languages.md) — its field values are content. -->
    <div class="collection-canvas" lang={locale}>
      {#if source}
        <section class="source">
          <h2>{m.collection_source_label()}</h2>
          <p>{[source.pluginLabel, source.summary?.name].filter(Boolean).join(' · ')}</p>
          {#if source.summary?.detail || source.summary?.checkedAt}
            <p class="muted">
              {[source.summary.detail, source.summary.checkedAt ? m.collection_source_checked({ when: formatDateTime(source.summary.checkedAt) }) : null].filter(Boolean).join(' · ')}
            </p>
          {/if}
          {#if source.summary?.problem}
            <div class="problem"><Alert tone="warning">{source.summary.problem}</Alert></div>
          {/if}
          {#if source.form}
            <div class="source-actions"><Button size="sm" onclick={() => (connectOpen = true)}>{m.collection_source_reconnect()}</Button></div>
          {/if}
        </section>
      {/if}
      {#if classFields && classFields.definitions.length > 0}
        <ClassFieldsPanel
          groupLabel={classFields.groups.length === 1 ? classFields.groups[0].label : classFields.nodeClass.label}
          slots={classSlots}
          groups={classFields.groups}
          ownClassId={classFields.nodeClass.id}
          onSetField={setClassField}
        />
      {/if}
      {#if source}
        <!-- A member's page is a reader route with a stricter style policy, so a full load. -->
        <section class="members" data-sveltekit-reload>
          <h2>{m.collection_members_heading()}</h2>
          {#if members.length === 0}
            <p class="empty">{m.collection_members_empty()}</p>
          {:else}
            <ol>
              {#each members as member (member.id)}
                <li>
                  <a href={member.url}>{member.title}</a>
                  <span class="member-kind"><Badge tone={member.type === 'document' ? 'info' : 'accent'}>{NODE_TYPE_LABEL[member.type]()}</Badge></span>
                </li>
              {/each}
            </ol>
          {/if}
        </section>
      {:else}
        <div class="members"><MembersEditor {collectionId} {members} basis={membersBasis} namespace={membersNamespace} /></div>
      {/if}
    </div>
  </div>
</div>

<AccessControlPanel
  open={accessControlOpen}
  {visibility}
  {namespaceAccessLevel}
  {namespaceMembers}
  {onSetVisibility}
  {namespaceId}
  {namespaces}
  {onSetNamespace}
  shareList={false}
  shareLinkSection={false}
  onClose={() => (accessControlOpen = false)}
/>

{#if source?.form && connectOpen}
  <CollectionConnectModal
    open={connectOpen}
    {collectionId}
    form={source.form}
    onConnected={() => onSourceConnected?.()}
    onOpenChange={(v) => (connectOpen = v)}
  />
{/if}

<DeleteCollectionModal open={deletion.open} busy={deletion.busy} error={deletion.error} onConfirm={deletion.confirm} onOpenChange={(v) => (deletion.open = v)} />

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
  /* DocumentEditor.svelte's frame. */
  .collection-editor { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--ds-color-bg); z-index: 1; }
  .collection-header-bar { flex: 0 0 auto; }
  .collection-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .collection-canvas { max-width: 42rem; margin: 0 auto; padding: 1.5rem; box-sizing: border-box; }
  h2 { margin: 0 0 0.6rem; font-size: 0.95rem; }
  .source { margin: 0 0 1.5rem; }
  .source p { margin: 0; }
  .source .muted { color: var(--ds-color-muted); font-size: var(--ds-text-sm); margin-top: 0.25rem; }
  .problem { margin-top: var(--ds-space-sm); }
  .source-actions { margin-top: var(--ds-space-sm); }
  .members { margin-top: 1.5rem; }
  .members ol { margin: 0; padding-inline-start: 1.4rem; display: grid; gap: 0.35rem; }
  .members li { overflow-wrap: anywhere; }
  .member-kind { margin-inline-start: 0.4rem; }
  .empty { margin: 0; color: var(--ds-color-muted); }
</style>
