<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The page's dialogs the head row opens: access, colour scheme, delete and
  // properties. Their open flags are the editor's (overlays.svelte.ts).
  import { AccessControlPanel } from '$lib/features/nodes/components';
  import { PagePropertiesDialog } from '$lib/features/semantic/components';
  import ContentSchemeDialog from './ContentSchemeDialog.svelte';
  import DeletePageModal from './DeletePageModal.svelte';
  import type { EditorCore } from '../core/editorCore.svelte';
  import type { MetaMirror } from '../meta/metaMirror.svelte';
  import type { DeleteRequest } from '../meta/deleteRequest.svelte';
  import type { PageEditorProps } from '../meta/nodeMeta';
  import type { EditorOverlays } from './overlays.svelte';

  let {
    core,
    meta,
    overlays,
    deletion,
    namespaceAccessLevel,
    namespaceMembers = [],
    users = [],
    shareLinks = [],
    onCreateShareLink,
    onRevokeShareLink,
    namespaceId,
    namespaces = [],
    onSetNamespace,
    contentScheme = null,
    contentSchemeDefault = 'light',
    onSetContentScheme,
    isHomePage = false,
    propSuggestions = [],
    propertyGroups = [],
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
    locale,
    onSetLocale,
    classFields = null,
  }: {
    core: EditorCore;
    meta: MetaMirror;
    overlays: EditorOverlays;
    deletion: DeleteRequest;
  } & Pick<
    PageEditorProps,
    | 'namespaceAccessLevel'
    | 'namespaceMembers'
    | 'users'
    | 'shareLinks'
    | 'onCreateShareLink'
    | 'onRevokeShareLink'
    | 'namespaceId'
    | 'namespaces'
    | 'onSetNamespace'
    | 'contentScheme'
    | 'contentSchemeDefault'
    | 'onSetContentScheme'
    | 'isHomePage'
    | 'propSuggestions'
    | 'propertyGroups'
    | 'nodeClassId'
    | 'nodeClasses'
    | 'onSetNodeClass'
    | 'locale'
    | 'onSetLocale'
    | 'classFields'
  > = $props();
</script>

<AccessControlPanel
  open={overlays.accessControl}
  visibility={meta.visibility}
  {namespaceAccessLevel}
  {namespaceMembers}
  shares={meta.shares}
  {users}
  onSetVisibility={meta.commitVisibility}
  onSetShares={meta.commitShares}
  {shareLinks}
  {onCreateShareLink}
  {onRevokeShareLink}
  {namespaceId}
  {namespaces}
  {onSetNamespace}
  onClose={() => (overlays.accessControl = false)}
/>

<ContentSchemeDialog
  open={overlays.contentScheme}
  onOpenChange={(v) => (overlays.contentScheme = v)}
  value={contentScheme}
  siteDefault={contentSchemeDefault}
  getDoc={() => (core.editor ? core.docJSON() : null)}
  onApply={(scheme) => onSetContentScheme?.(scheme) ?? Promise.resolve({ ok: false })}
  onShowBlock={(blockId) => core.selection.selectBlockById(blockId)}
/>

<DeletePageModal
  open={deletion.open}
  isHomePage={!!isHomePage}
  busy={deletion.busy}
  error={deletion.error}
  onConfirm={deletion.confirm}
  onOpenChange={(v) => (deletion.open = v)}
/>

<PagePropertiesDialog
  bind:open={overlays.pageProperties}
  pageProperties={core.properties.pageProperties}
  manualProperties={meta.manualProperties}
  onSetManualProperties={meta.commitManualProperties}
  {propSuggestions}
  {propertyGroups}
  {nodeClassId}
  {nodeClasses}
  {onSetNodeClass}
  {locale}
  {onSetLocale}
  classDefinitions={classFields?.definitions ?? []}
  classGroups={classFields?.groups ?? []}
/>
