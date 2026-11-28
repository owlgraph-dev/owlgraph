// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/[[space=space]]/[slug]/+page.server.ts.
import { redirect } from '@sveltejs/kit';
import { notFound } from '#lib/features/auth/routes/requireAction.server.ts';
import { getNodeBySlug } from '#lib/features/nodes/server.ts';
import { resolveSpaceParam } from '#lib/features/spaces/server.ts';
import { effectiveVisibility, nodePath, type NodeAccess } from '#lib/features/nodes/index.ts';
import { getPage, userCanReadPage, userCanWritePage } from '#lib/features/pages/server.ts';
import { getIncomingEdges, getLocalGraph, relationshipGroups } from '#lib/features/graph/server.ts';
import { getNodeTags } from '#lib/features/semantic/server.ts';
import { previewScheme } from '#lib/features/content/index.ts';
import { getDocument, userCanReadDocument, userCanWriteDocument } from '#lib/features/documents/server.ts';
import { CONTAINS, getCollection, membersOf, userCanReadCollection, userCanWriteCollection } from '#lib/features/collections/server.ts';
import { resolveNodeView } from '#lib/features/pluginHost/server.ts';
import { renderPage } from '#lib/features/reader/server.ts';
import { pluginLabel } from '#lib/plugins/index.ts';
import { getManualProperties } from '#lib/features/semantic/server.ts';
import { getNodeClassFields } from '#lib/features/semantic/server.ts';
import type { ClassFields } from '#lib/features/semantic/index.ts';
import type { NodeHeaderView } from '#lib/features/nodes/index.ts';
import * as m from '#lib/paraglide/messages.js';
import type { ServerLoadEvent } from '@sveltejs/kit';

type Params = { space?: string; slug: string };

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

/**
 * A node the asker may not read, whatever it holds: a signed-out visitor to
 * one that is not restricted is sent to sign in, the one exception criterion 5
 * of spec 002 names; anyone else is answered as for an address no node has, so
 * that neither a sign-in nor the words say it is there. Effective visibility:
 * an inheriting node is as closed as its space.
 */
function unreadable(user: App.Locals['user'], node: NodeAccess, path: string): never {
  if (!user && effectiveVisibility(node) !== 'restricted') throw redirect(303, `/login?redirect=${encodeURIComponent(path)}`);
  notFound();
}

// Served under the reader's strict CSP (docs/architecture/overview.md, "Content Security
// Policy"): block styles travel in the nonce'd per-page stylesheet. The html
// block's sanitizer is the first line against authored script or style.
export const load = async ({ params, locals, url }: ServerLoadEvent<Params>) => {
  const space = await resolveSpaceParam(params.space);
  if (!space) notFound();
  const node = await getNodeBySlug(space.id, params.slug);
  if (!node) notFound();
  const path = nodePath(space.slug, params.slug);

  if (node.type === 'page') {
    const page = await getPage(node.id);
    if (!page) notFound();
    if (!(await userCanReadPage(locals.user, page))) unreadable(locals.user, page, path);
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
    const collection = await getCollection(node.id);
    if (!collection) notFound();
    if (!(await userCanReadCollection(locals.user, collection))) unreadable(locals.user, collection, path);
    const canEdit = await userCanWriteCollection(locals.user, collection);
    const [members, tags, manualProperties, classFields, relationships, source] = await Promise.all([
      membersOf(collection.id, locals.user),
      getNodeTags(collection.id),
      getManualProperties(collection.id),
      getNodeClassFields(collection.id),
      // Its members are its body, so outgoing `contains` is left out here.
      relationshipGroups(locals.user, collection.id, { membership: CONTAINS }),
      // For this viewer, from what the integration already holds.
      resolveNodeView(collection, { user: locals.user, locale: locals.locale, log: locals.log, returnTo: url.pathname, canWrite: canEdit }),
    ]);
    const header: NodeHeaderView = {
      space: space.name,
      title: collection.title,
      locale: collection.locale,
      classes: (classFields?.classes ?? []).map((c) => ({ label: c.label, href: c.overviewPath })),
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

  const doc = await getDocument(node.id);
  if (!doc) notFound();
  if (!(await userCanReadDocument(locals.user, doc))) unreadable(locals.user, doc, path);
  return {
    kind: 'document' as const,
    // The badge shows the effective value, never null.
    doc: { ...doc, visibility: doc.visibility ?? doc.space_access_level },
    referencedBy: await getIncomingEdges(doc.id, locals.user),
    canEdit: await userCanWriteDocument(locals.user, doc),
    tags: await getNodeTags(doc.id),
    manualProperties: await getManualProperties(doc.id),
    classFields: await getNodeClassFields(doc.id),
  };
};
