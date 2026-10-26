// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/[[namespace=namespace]]/[slug]/+page.server.ts.
import { error, redirect } from '@sveltejs/kit';
import { getNodeBySlug } from '$lib/features/nodes/server';
import { resolveNamespaceParam } from '$lib/features/namespaces/server';
import { effectiveVisibility, nodePath } from '$lib/features/nodes';
import { getPage, userCanReadPage, userCanWritePage } from '$lib/features/pages/server';
import { getIncomingEdges, getLocalGraph, relationshipGroups } from '$lib/features/graph/server';
import { getNodeTags } from '$lib/features/semantic/server';
import { previewScheme } from '$lib/features/content';
import { getDocument, userCanReadDocument, userCanWriteDocument } from '$lib/features/documents/server';
import { CONTAINS, getCollection, membersOf, userCanReadCollection, userCanWriteCollection } from '$lib/features/collections/server';
import { resolveNodeView } from '$lib/features/pluginHost/server';
import { renderPage } from '$lib/features/reader/server';
import { pluginLabel } from '$lib/plugins';
import { getManualProperties } from '$lib/features/semantic/server';
import { getNodeClassFields } from '$lib/features/semantic/server';
import type { ClassFields } from '$lib/features/semantic';
import type { NodeHeaderView } from '$lib/features/nodes';
import * as m from '$lib/paraglide/messages';
import type { ServerLoadEvent } from '@sveltejs/kit';

type Params = { namespace?: string; slug: string };

/** The set class fields, in definition order: short ones as rows, long ones as sections. */
function classProperties(classFields: ClassFields | null, values: readonly { name: string; value: string }[]): NodeHeaderView['properties'] {
  const set = (classFields?.definitions ?? [])
    .map((d) => ({ name: d.name, label: d.label, datatype: d.datatype, value: values.find((v) => v.name === d.name)?.value ?? '' }))
    .filter((p) => p.value !== '');
  const plain = ({ name, label, value }: { name: string; label: string; value: string }) => ({ name, label, value });
  return { short: set.filter((p) => p.datatype !== 'longtext').map(plain), long: set.filter((p) => p.datatype === 'longtext').map(plain) };
}

const entries = (count: number) => (count === 1 ? m.node_contains_entries_one({ count }) : m.node_contains_entries_other({ count }));
const linked = (count: number) => (count === 1 ? m.node_contains_linked_one({ count }) : m.node_contains_linked_other({ count }));

// Served under the reader's strict CSP (docs/architecture/overview.md, "Content Security
// Policy"): block styles travel in the nonce'd per-page stylesheet. The html
// block's sanitizer is the first line against authored script or style.
export const load = async ({ params, locals, url }: ServerLoadEvent<Params>) => {
  const namespace = await resolveNamespaceParam(params.namespace);
  if (!namespace) throw error(404, 'Not found');
  const node = await getNodeBySlug(namespace.id, params.slug);
  if (!node) throw error(404, 'Not found');
  const path = nodePath(namespace.slug, params.slug);

  if (node.type === 'page') {
    const page = await getPage(node.id);
    if (!page) throw error(404, 'Page not found');
    if (!(await userCanReadPage(locals.user, page))) {
      // An anonymous visitor to a non-restricted page is sent to sign in. A
      // restricted page 404s for everyone without access, so a login redirect
      // can't reveal it exists. Effective visibility: an inherited page is as
      // sensitive as its namespace.
      const effectiveVisibility = page.visibility ?? page.namespace_access_level;
      if (!locals.user && effectiveVisibility !== 'restricted') {
        throw redirect(303, `/login?redirect=${encodeURIComponent(path)}`);
      }
      throw error(404, 'Page not found');
    }
    // `?scheme=light|dark` previews an adaptive page in that scheme; it changes
    // only colours, so it needs no permission.
    const rendered = await renderPage(
      page,
      { kind: 'visitor', user: locals.user, locale: locals.locale, log: locals.log, returnTo: url.pathname },
      { previewScheme: previewScheme(url) }
    );
    return {
      kind: 'page' as const,
      id: page.id,
      title: page.title,
      locale: page.locale,
      html: rendered.html,
      imagePreloads: rendered.preloads,
      css: rendered.css,
      canvasRuleId: rendered.canvasRuleId,
      groundRuleId: rendered.groundRuleId,
      referencedBy: await getIncomingEdges(page.id, locals.user),
      tags: await getNodeTags(page.id),
      localGraph: await getLocalGraph(page.id, locals.user),
      firstBlockBleeds: rendered.firstBlockBleeds,
      contentScheme: rendered.contentScheme,
      // Shows the Edit shortcut only; the edit route enforces the check itself.
      canEdit: await userCanWritePage(locals.user, page),
    };
  }

  if (node.type === 'collection') {
    // As a page: anonymous on non-restricted signs in; restricted reveals nothing.
    const collection = await getCollection(node.id);
    if (!collection) throw error(404, 'Not found');
    if (!(await userCanReadCollection(locals.user, collection))) {
      const effectiveVisibility = collection.visibility ?? collection.namespace_access_level;
      if (!locals.user && effectiveVisibility !== 'restricted') throw redirect(303, `/login?redirect=${encodeURIComponent(path)}`);
      throw error(404, 'Not found');
    }
    const canEdit = await userCanWriteCollection(locals.user, collection);
    const [members, tags, manualProperties, classFields, relationships, source] = await Promise.all([
      membersOf(collection.id, locals.user),
      getNodeTags(collection.id),
      getManualProperties(collection.id),
      getNodeClassFields(collection.class_id),
      // Its members are its body, so outgoing `contains` is left out here.
      relationshipGroups(locals.user, collection.id, { membership: CONTAINS }),
      // For this viewer, from what the integration already holds.
      resolveNodeView(collection, { user: locals.user, locale: locals.locale, log: locals.log, returnTo: url.pathname, canWrite: canEdit }),
    ]);
    const header: NodeHeaderView = {
      namespace: namespace.name,
      title: collection.title,
      locale: collection.locale,
      nodeClass: classFields ? { label: classFields.nodeClass.label, href: classFields.nodeClass.overviewPath ?? null } : null,
      source: collection.plugin ? { label: source?.label ?? pluginLabel(collection.plugin), readsVia: source?.readsVia ?? null } : null,
      visibility: effectiveVisibility(collection),
      properties: classProperties(classFields, manualProperties),
      tags,
      // Counted after pruning: a mirrored source's entries beside the documents made of them.
      contains: collection.plugin
        ? [source?.detail ?? null, linked(members.length)].filter(Boolean).join(' · ')
        : entries(members.length),
      relationships,
      actions: source?.actions ?? [],
    };
    return {
      kind: 'collection' as const,
      collection: { id: collection.id, title: collection.title, href: path },
      header,
      members,
      source,
      canEdit,
    };
  }

  // Unlike a page, an anonymous visitor is sent to sign in even for a
  // restricted document, which reveals that it exists.
  const doc = await getDocument(node.id);
  if (!doc) throw error(404, 'Document not found');
  if (!(await userCanReadDocument(locals.user, doc))) {
    if (!locals.user) throw redirect(303, `/login?redirect=${encodeURIComponent(path)}`);
    throw error(404, 'Document not found');
  }
  return {
    kind: 'document' as const,
    // The badge shows the effective value, never null.
    doc: { ...doc, visibility: doc.visibility ?? doc.namespace_access_level },
    referencedBy: await getIncomingEdges(doc.id, locals.user),
    canEdit: userCanWriteDocument(locals.user, doc),
    tags: await getNodeTags(doc.id),
    manualProperties: await getManualProperties(doc.id),
    classFields: await getNodeClassFields(doc.class_id),
  };
};
