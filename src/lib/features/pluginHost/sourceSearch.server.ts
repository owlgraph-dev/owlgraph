// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What search finds an integration's nodes by besides their titles
// (docs/architecture/plugins.md, "Sources"): the integration's label in the node's language
// and the plugin's `searchText`, never a credential. The host rewrites it with
// every write of a node's source record.
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { Logger } from '$lib/platform/logger.server';
import { pluginFailed } from './pluginFailure.server';
import { getCollection, getCollectionSourceRef, mirroredCollectionIds, setCollectionSourceSearch } from '$lib/features/collections/server';
import { getDocument, getDocumentSourceRef, pluginDocumentIds, setDocumentSourceSearch } from '$lib/features/documents/server';
import { pluginManifest } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import type { PluginSearchNode } from '$lib/plugins/api';

// Ample for a deep path; a plugin cannot fill the index with more.
const MAX_LENGTH = 2000;

/** In the node's language, `locale`. */
async function sourceSearchText(plugin: string, node: PluginSearchNode, locale: string, log?: Logger): Promise<string> {
  const manifest = pluginManifest(plugin);
  if (!manifest) return '';
  const own = pluginServer(plugin)?.nodeSource?.searchText;
  return withContentLocale(locale, () => {
    let said = '';
    try {
      said = own ? own(node) : '';
    } catch (error) {
      // A plugin that fails to say anything leaves its label.
      if (log) pluginFailed(log, `search text of '${plugin}'`, error);
    }
    return [manifest.label(), said]
      .map((words) => words.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, MAX_LENGTH);
  });
}

/** Call after a node's source record was written. */
export async function indexSourceSearch(type: 'collection' | 'document', id: string, log?: Logger): Promise<void> {
  if (type === 'collection') {
    const row = await getCollection(id);
    const ref = row?.plugin ? await getCollectionSourceRef(id) : null;
    if (!row?.plugin || !ref) return;
    await setCollectionSourceSearch(id, await sourceSearchText(row.plugin, { type, title: row.title, ref, file: null }, row.locale, log));
    return;
  }
  const row = await getDocument(id);
  const ref = row?.source === 'plugin' && row.plugin ? await getDocumentSourceRef(id) : null;
  if (!row?.plugin || !ref) return;
  const file = { filename: row.filename, mime: row.mime, size: row.size };
  await setDocumentSourceSearch(id, await sourceSearchText(row.plugin, { type, title: row.title, ref, file }, row.locale, log));
}

/** For when a plugin changes what it says (scripts/backfill-search.ts). */
export async function reindexSourceSearch(log?: Logger): Promise<{ documents: number; collections: number }> {
  const documents = await pluginDocumentIds();
  for (const id of documents) await indexSourceSearch('document', id, log);
  const collections = await mirroredCollectionIds();
  for (const id of collections) await indexSourceSearch('collection', id, log);
  return { documents: documents.length, collections: collections.length };
}
