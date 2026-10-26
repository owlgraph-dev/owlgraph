// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/[[namespace=namespace]]/[slug]/edit/+page.server.ts.
import { error, redirect } from '@sveltejs/kit';
import { getNodeBySlug } from '$lib/features/nodes/server';
import { resolveNamespaceParam, listNamespacesForUser, getNamespaceMembers } from '$lib/features/namespaces/server';
import { nodePath } from '$lib/features/nodes';
import {
  getPage,
  listPagesForUser,
  getPageShares,
  userCanReadPage,
  userCanWritePage,
} from '$lib/features/pages/server';
import { getHomePageId } from '$lib/features/site/server';
import { listEnabledPageLayoutPresets } from '$lib/features/pages/server';
import { collectAssetIds, type JsonNode } from '$lib/features/content';
import { getAssetSizes } from '$lib/features/media/server';
import { getNodeTags, listTags } from '$lib/features/semantic/server';
import { listDocumentsForUser, getDocument, getDocumentShares, userCanReadDocument, userCanWriteDocument } from '$lib/features/documents/server';
import { getCollection, membersWithBasis, userCanReadCollection, userCanWriteCollection } from '$lib/features/collections/server';
import { describeCollectionSource, enabledPlugins } from '$lib/features/pluginHost/server';
// Labels arrive resolved for the request's locale (docs/architecture/languages.md).
import { getManualProperties, listPropertySuggestionOptions, listPropertyGroupOptions } from '$lib/features/semantic/server';
// nodeClasses is every assignable class: the class picker narrows it to the
// node's type, the query builder offers all of them.
import { listNodeClassOptions, getNodeClassFields } from '$lib/features/semantic/server';
import { listUsers } from '$lib/features/auth/server';
import { latestVersionId } from '$lib/features/pages/server';
import { getContentSchemeDefault } from '$lib/features/content/server';
import { can } from '$lib/features/auth/server';
import { listShareLinks } from '$lib/features/nodes/server';
import type { ServerLoadEvent } from '@sveltejs/kit';

type Params = { namespace?: string; slug: string };

export const load = async ({ params, locals }: ServerLoadEvent<Params>) => {
  if (!can(locals.user, 'page:write')) throw redirect(303, '/');
  const namespace = await resolveNamespaceParam(params.namespace);
  if (!namespace) throw error(404, 'Page not found');
  const node = await getNodeBySlug(namespace.id, params.slug);
  if (!node) throw error(404, 'Page not found');

  if (node.type === 'document') {
    const doc = await getDocument(node.id);
    if (!doc) throw error(404, 'Document not found');
    if (!userCanWriteDocument(locals.user, doc)) {
      if (await userCanReadDocument(locals.user, doc)) throw redirect(303, nodePath(doc.namespace_slug, doc.slug));
      throw redirect(303, '/');
    }
    const allUsers = await listUsers();
    const namespaceMembers =
      doc.namespace_access_level === 'restricted'
        ? (await getNamespaceMembers(doc.namespace_id))
            .map((id) => allUsers.find((u) => u.id === id))
            .filter((u): u is NonNullable<typeof u> => !!u)
            .map((u) => ({ id: u.id, name: u.name, email: u.email }))
        : [];
    return {
      kind: 'document' as const,
      doc,
      tags: await getNodeTags(doc.id),
      // Unfiltered: the document editor splits off the class's group itself.
      manualProperties: await getManualProperties(doc.id),
      propSuggestions: await listPropertySuggestionOptions(locals.user),
      propertyGroups: await listPropertyGroupOptions(),
      tagSuggestions: (await listTags(locals.user)).map((t) => t.tag),
      nodeClassId: doc.class_id,
      locale: doc.locale,
      localeSuggestion: doc.detected_locale,
      nodeClasses: await listNodeClassOptions(),
      classFields: await getNodeClassFields(doc.class_id),
      // As stored: null inherits the namespace's access level.
      visibility: doc.visibility,
      namespaceAccessLevel: doc.namespace_access_level,
      namespaceMembers,
      shares: await getDocumentShares(doc.id),
      users: allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      shareLinks: (await listShareLinks(doc.id)).map((l) => ({ id: l.id, label: l.label, createdAt: l.created_at })),
      namespaces: (await listNamespacesForUser(locals.user)).map((n) => ({ id: n.id, name: n.name, slug: n.slug, isDefault: n.is_default })),
    };
  }

  if (node.type === 'collection') {
    const collection = await getCollection(node.id);
    if (!collection) throw error(404, 'Page not found');
    if (!(await userCanWriteCollection(locals.user, collection))) {
      if (await userCanReadCollection(locals.user, collection)) throw redirect(303, nodePath(collection.namespace_slug, collection.slug));
      throw redirect(303, '/');
    }
    const allUsers = await listUsers();
    const namespaceMembers =
      collection.namespace_access_level === 'restricted'
        ? (await getNamespaceMembers(collection.namespace_id))
            .map((id) => allUsers.find((u) => u.id === id))
            .filter((u): u is NonNullable<typeof u> => !!u)
            .map((u) => ({ id: u.id, name: u.name, email: u.email }))
        : [];
    const { members, basis: membersBasis } = await membersWithBasis(collection.id, locals.user);
    return {
      kind: 'collection' as const,
      collection,
      // When an integration mirrors it (docs/architecture/plugins.md, "Sources").
      source: await describeCollectionSource(collection, { user: locals.user, locale: locals.locale, log: locals.log }),
      members,
      // The order's basis as read, which a rearrangement names.
      membersBasis,
      tags: await getNodeTags(collection.id),
      manualProperties: await getManualProperties(collection.id),
      propSuggestions: await listPropertySuggestionOptions(locals.user),
      propertyGroups: await listPropertyGroupOptions(),
      tagSuggestions: (await listTags(locals.user)).map((t) => t.tag),
      nodeClassId: collection.class_id,
      locale: collection.locale,
      nodeClasses: await listNodeClassOptions(),
      classFields: await getNodeClassFields(collection.class_id),
      visibility: collection.visibility,
      namespaceAccessLevel: collection.namespace_access_level,
      namespaceMembers,
      namespaces: (await listNamespacesForUser(locals.user)).map((n) => ({ id: n.id, name: n.name, slug: n.slug, isDefault: n.is_default })),
    };
  }

  const page = await getPage(node.id);
  if (!page) throw error(404, 'Page not found');
  if (!(await userCanWritePage(locals.user, page))) {
    if (await userCanReadPage(locals.user, page)) throw redirect(303, nodePath(page.namespace_slug, page.slug));
    throw redirect(303, '/');
  }
  const all = await listPagesForUser(locals.user);
  // Load-time id -> path snapshots for the in-doc link hrefs. A document's
  // plugin picks the block a quick link to it becomes (docs/architecture/blocks/node-embeds.md, "A quick link becomes a block").
  const documents = (await listDocumentsForUser(locals.user)).map((d) => ({
    id: d.id,
    slug: d.slug,
    namespaceSlug: d.namespace_slug,
    title: d.title,
    plugin: d.plugin,
  }));
  const allUsers = await listUsers();
  // Shown read-only when the page inherits a restricted namespace. The share
  // list only narrows; membership is managed under namespace:manage.
  const namespaceMembers =
    page.namespace_access_level === 'restricted'
      ? (await getNamespaceMembers(page.namespace_id))
          .map((id) => allUsers.find((u) => u.id === id))
          .filter((u): u is NonNullable<typeof u> => !!u)
          .map((u) => ({ id: u.id, name: u.name, email: u.email }))
      : [];
  return {
    kind: 'page' as const,
    page,
    pages: all
      .filter((p) => p.id !== page.id)
      .map((p) => ({ ...p, namespaceSlug: p.namespace_slug })),
    documents,
    namespaces: (await listNamespacesForUser(locals.user)).map((n) => ({ id: n.id, name: n.name, slug: n.slug, isDefault: n.is_default })),
    tags: await getNodeTags(page.id),
    manualProperties: await getManualProperties(page.id),
    propSuggestions: await listPropertySuggestionOptions(locals.user),
    propertyGroups: await listPropertyGroupOptions(),
    tagSuggestions: (await listTags(locals.user)).map((t) => t.tag),
    nodeClassId: page.class_id,
    locale: page.locale,
    nodeClasses: await listNodeClassOptions(),
    classFields: await getNodeClassFields(page.class_id),
    visibility: page.visibility,
    namespaceAccessLevel: page.namespace_access_level,
    namespaceMembers,
    shares: await getPageShares(page.id),
    users: allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
    shareLinks: (await listShareLinks(page.id)).map((l) => ({ id: l.id, label: l.label, createdAt: l.created_at })),
    me: locals.user ? { id: locals.user.id, name: locals.user.name, role: locals.user.role } : null,
    baseVersionId: await latestVersionId(page.id),
    pageLayoutPresets: await listEnabledPageLayoutPresets(),
    // docs/architecture/blocks/node-embeds.md, "One family in the editor".
    enabledPlugins: await enabledPlugins(),
    // By which the page's images offer their copies (assetSizeRegistry.ts).
    assetSizes: page.doc ? await getAssetSizes(collectAssetIds(page.doc as JsonNode)) : {},
    // null = the site default, sent too so the editor shows what "inherit" resolves to.
    contentScheme: page.content_scheme,
    contentSchemeDefault: await getContentSchemeDefault(),
    isHomePage: page.id === (await getHomePageId()),
  };
};

/** What the edit route's load gives, by the node's kind; the route adapter component types its data with it. */
export type EditPageData = Awaited<ReturnType<typeof load>>;
