<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The edit route (src/routes/[[namespace=namespace]]/[slug]/edit): the node's
  // editor by its kind, and around a page's the edit lock, its gate and the
  // reconcile of a lost lock's draft. What only a route can do stays here:
  // the route's lifecycle, navigation, reloads, the shell the viewport picks.
  import { onMount, onDestroy, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import DesktopEditor from '../desktop/DesktopEditor.svelte';
  import PhoneEditor from '../phone/PhoneEditor.svelte';
  import DocumentEditor from '../document/DocumentEditor.svelte';
  import CollectionEditor from '../collection/CollectionEditor.svelte';
  import LockGate from './LockGate.svelte';
  import { EditLock } from '../session/editLock.svelte';
  import { LostDraft } from '../session/lostDraft.svelte';
  import { nodeActions } from '../meta/nodeActions';
  import type { PageEditorProps } from '../meta/nodeMeta';
  import type { EditPageData } from './edit.server';
  import { ReconcilePanel } from '$lib/features/pages/components';
  import {
    savePageDoc,
    acquirePageLock,
    heartbeatPageLock,
    releasePageLock,
    beaconReleasePageLock,
    getPageLockStatus,
    saveDraftVersion,
    applyPagePicks,
    uploadPageImage,
    editTabs,
  } from '$lib/features/pages';
  import { replaceDocumentFile, setDocumentLink } from '$lib/features/documents';
  import { nodeMetaClient, nodePath } from '$lib/features/nodes';
  import { toast, PHONE_SHELL_MEDIA } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { setAssetSizes } from '$lib/features/content';
  import { setPageLayoutPresets } from '$lib/features/pages';

  let { data }: { data: EditPageData } = $props();
  // The phone shell's query, so turning a phone never swaps editors.
  const phone = new MediaQuery(PHONE_SHELL_MEDIA);

  // Derived, not read off data: the component doesn't remount when a client
  // navigation moves to another node.
  const page = $derived(data.kind === 'page' ? data.page : null);
  const doc = $derived(data.kind === 'document' ? data.doc : null);
  const collection = $derived(data.kind === 'collection' ? data.collection : null);

  // Set before the editor mounts, and again when a navigation brings new data.
  setPageLayoutPresets(untrack(() => (data.kind === 'page' ? data.pageLayoutPresets : [])));
  $effect.pre(() => {
    setPageLayoutPresets(data.kind === 'page' ? data.pageLayoutPresets : []);
  });
  setAssetSizes(untrack(() => (data.kind === 'page' ? data.assetSizes : {})));
  $effect.pre(() => {
    setAssetSizes(data.kind === 'page' ? data.assetSizes : {});
  });

  const lock = new EditLock(() => page?.id ?? null, {
    client: {
      acquire: acquirePageLock,
      heartbeat: heartbeatPageLock,
      release: releasePageLock,
      beaconRelease: beaconReleasePageLock,
      status: getPageLockStatus,
      save: savePageDoc,
      editTabs,
    },
    storage: () => sessionStorage,
    reload: () => window.location.reload(),
    confirm: (message) => confirm(message),
  });
  const draft = new LostDraft({
    pageId: () => page?.id ?? null,
    baseVersionId: () => (data.kind === 'page' ? (data.baseVersionId ?? null) : null),
    lock,
    client: { saveDraft: saveDraftVersion, applyPicks: applyPagePicks },
    reload: () => window.location.reload(),
    leave: () => {
      if (page) goto(nodePath(page.namespace_slug, page.slug));
    },
  });

  onMount(() => {
    if (page) {
      window.addEventListener('pagehide', lock.beaconRelease);
      lock.open();
    }
  });
  onDestroy(() => {
    lock.stop();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', lock.beaconRelease);
  });
  // Leaving gives the lock back; the editor's own move to the page's new
  // address (a renamed slug, another namespace) keeps it.
  beforeNavigate((navigation) => {
    if (page && navigation.to?.url.pathname === nodePath(page.namespace_slug, page.slug, { edit: true })) return;
    lock.leave();
  });

  const routing = { namespaces: () => data.namespaces, goto, invalidateAll };
  const pageActions = $derived(page ? nodeActions(nodeMetaClient('pages', page.id), page, { deleteFallback: m.editor_delete_page_failed(), beforeDelete: lock.release, ...routing }) : null);

  // The canvas and the dialog read the scheme from the route data.
  async function setContentScheme(scheme: string | null) {
    if (!page) return { ok: false };
    const res = await nodeMetaClient('pages', page.id).setContentScheme(scheme);
    if (res.ok) await invalidateAll();
    return res;
  }
  const docActions = $derived(doc ? nodeActions(nodeMetaClient('documents', doc.id), doc, { deleteFallback: m.editor_delete_document_failed(), ...routing }) : null);
  const collectionActions = $derived(collection ? nodeActions(nodeMetaClient('collections', collection.id), collection, { deleteFallback: m.editor_delete_collection_failed(), ...routing }) : null);

  // A toast: a paste or a drop has no control to hang an error on.
  async function uploadImage(file: File) {
    if (!page) return null;
    const res = await uploadPageImage(page.id, file);
    if (!res) toast.error(m.editor_image_upload_failed());
    return res;
  }

  // Reloaded after either: `data` is not deep state, so a write to `doc` would
  // not render. A file on a link document switches it to 'upload'.
  async function replaceFile(file: File) {
    if (!doc) return { ok: false, error: m.editor_document_not_found() };
    const res = await replaceDocumentFile(doc.id, file);
    if (res.ok) await invalidateAll();
    return res;
  }

  // Edits the URL, or switches an upload to a link (its file is deleted).
  async function setLink(url: string) {
    if (!doc) return { ok: false as const, error: m.editor_document_not_found() };
    const res = await setDocumentLink(doc.id, url);
    if (res.ok) await invalidateAll();
    return res;
  }

  // One prop list for either shell; the lock's state is passed beside it, so
  // the shells' effects follow it alone.
  const pageProps = $derived<PageEditorProps | null>(
    data.kind === 'page' && page && pageActions
      ? {
          doc: page.doc,
          pageId: page.id,
          onSave: lock.save,
          pages: data.pages,
          documents: data.documents,
          enabledPlugins: data.enabledPlugins,
          title: page.title,
          slug: page.slug,
          namespaceSlug: page.namespace_slug,
          tags: data.tags,
          manualProperties: data.manualProperties,
          propSuggestions: data.propSuggestions,
          propertyGroups: data.propertyGroups,
          tagSuggestions: data.tagSuggestions,
          nodeClassId: data.nodeClassId,
          locale: data.locale,
          nodeClasses: data.nodeClasses,
          classFields: data.classFields,
          visibility: data.visibility,
          namespaceAccessLevel: data.namespaceAccessLevel,
          namespaceMembers: data.namespaceMembers,
          shares: data.shares,
          users: data.users,
          shareLinks: data.shareLinks,
          namespaceId: page.namespace_id,
          namespaces: data.namespaces,
          onUploadImage: uploadImage,
          onLockLost: draft.onLockLost,
          isHomePage: data.isHomePage,
          contentScheme: page.content_scheme,
          contentSchemeDefault: data.contentSchemeDefault,
          onSetContentScheme: setContentScheme,
          ...pageActions,
        }
      : null
  );
</script>

{#if data.kind === 'document' && doc && docActions}
  <DocumentEditor
    documentId={doc.id}
    title={doc.title}
    slug={doc.slug}
    namespaceSlug={doc.namespace_slug}
    source={doc.source}
    plugin={doc.plugin}
    externalUrl={doc.external_url}
    filename={doc.filename}
    mime={doc.mime}
    size={doc.size}
    tags={data.tags}
    tagSuggestions={data.tagSuggestions}
    manualProperties={data.manualProperties}
    propSuggestions={data.propSuggestions}
    propertyGroups={data.propertyGroups}
    nodeClassId={data.nodeClassId}
    locale={data.locale}
    localeSuggestion={data.localeSuggestion}
    nodeClasses={data.nodeClasses}
    classFields={data.classFields}
    onReplaceFile={replaceFile}
    onSetLink={setLink}
    visibility={data.visibility}
    namespaceAccessLevel={data.namespaceAccessLevel}
    namespaceMembers={data.namespaceMembers}
    shares={data.shares}
    users={data.users}
    shareLinks={data.shareLinks}
    namespaceId={doc.namespace_id}
    namespaces={data.namespaces}
    {...docActions}
  />
{:else if data.kind === 'collection' && collection && collectionActions}
  <CollectionEditor
    collectionId={collection.id}
    title={collection.title}
    slug={collection.slug}
    namespaceSlug={collection.namespace_slug}
    source={data.source}
    onSourceConnected={() => invalidateAll()}
    members={data.members}
    membersBasis={data.membersBasis}
    tags={data.tags}
    tagSuggestions={data.tagSuggestions}
    manualProperties={data.manualProperties}
    propSuggestions={data.propSuggestions}
    propertyGroups={data.propertyGroups}
    nodeClassId={data.nodeClassId}
    locale={data.locale}
    nodeClasses={data.nodeClasses}
    classFields={data.classFields}
    visibility={data.visibility}
    namespaceAccessLevel={data.namespaceAccessLevel}
    namespaceMembers={data.namespaceMembers}
    namespaceId={collection.namespace_id}
    namespaces={data.namespaces}
    {...collectionActions}
  />
{:else if data.kind === 'page' && page && pageProps}
  {#if lock.phase === 'editing' || lock.phase === 'lost'}
    {@const Shell = phone.current ? PhoneEditor : DesktopEditor}
    <Shell {...pageProps} lockLost={lock.phase === 'lost'} />
    {#if draft.reconcile}
      <ReconcilePanel pageId={page.id} current={draft.reconcile.current} draft={draft.reconcile.draft} movedToTab={lock.lostTo === 'tab'} onApply={draft.apply} onDiscard={draft.discard} />
    {/if}
  {:else}
    <LockGate {lock} isAdmin={data.me?.role === 'admin'} readHref={nodePath(page.namespace_slug, page.slug)} />
  {/if}
{/if}
