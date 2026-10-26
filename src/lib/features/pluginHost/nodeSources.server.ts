// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Plugin-sourced nodes (docs/architecture/plugins.md, "Sources"): a document or collection
// whose `plugin` is a plugin is answered for by its server half, once the
// core's route has checked the reader or the writer.
import type { CollectionRow } from '$lib/features/collections/server';
import type { DocumentRow } from '$lib/features/documents/server';
import { pluginManifest } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import { createPluginHost, type HostContext } from './host.server';
import type { CollectionSourceView } from './types';
import { apiError, pluginError } from '$lib/platform/apiErrors';

/** At most this long, each value a connect form posts. */
const MAX_CONNECT_VALUE = 2048;

/**
 * For a reader the caller has checked, or a share link in `ctx` that grants the document.
 * Null when its plugin is gone or serves nothing: the caller's 404.
 */
export async function servePluginDocument(doc: DocumentRow, opts: { download: boolean }, ctx: HostContext): Promise<Response | null> {
  if (doc.source !== 'plugin' || !doc.plugin || !pluginManifest(doc.plugin)) return null;
  const serve = pluginServer(doc.plugin)?.nodeSource?.serveDocument;
  if (!serve) return null;
  const host = createPluginHost(doc.plugin, ctx);
  const node = await host.nodes.read(doc.id);
  return node ? serve(node, opts, host) : null;
}

/** From the plugin's record alone, with no request to the service. Null for a curated collection. */
export async function describeCollectionSource(collection: CollectionRow, ctx: HostContext): Promise<CollectionSourceView | null> {
  const plugin = collection.plugin;
  if (!plugin) return null;
  const manifest = pluginManifest(plugin);
  if (!manifest) return { pluginLabel: plugin, summary: null, form: null };
  const source = pluginServer(plugin)?.nodeSource;
  let summary: CollectionSourceView['summary'] = null;
  if (source?.describeCollection) {
    const node = await createPluginHost(plugin, ctx).nodes.read(collection.id);
    if (node) summary = source.describeCollection(node);
  }
  const form = manifest.sources?.collection;
  return {
    pluginLabel: manifest.label(),
    summary,
    form:
      form && source?.connectCollection
        ? { fields: form.fields.map((f) => ({ key: f.key, kind: f.kind, label: f.label(), description: f.description?.() ?? null, required: f.required })) }
        : null,
  };
}

/**
 * For a writer the caller has checked: only the fields the plugin's connect form declares, as
 * strings with the required ones given, reach the plugin, which checks them against its service.
 */
export async function connectCollectionSource(
  collection: CollectionRow,
  values: unknown,
  ctx: HostContext
): Promise<Response> {
  const plugin = collection.plugin;
  const form = plugin ? pluginManifest(plugin)?.sources?.collection : undefined;
  const connect = plugin ? pluginServer(plugin)?.nodeSource?.connectCollection : undefined;
  if (!plugin || !form || !connect) return apiError('no_source');

  const given = values && typeof values === 'object' && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const clean: Record<string, string> = {};
  for (const field of form.fields) {
    const value = given[field.key];
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > MAX_CONNECT_VALUE)) {
      return apiError('invalid_request', { field: field.key });
    }
    if (typeof value === 'string' && value.trim() !== '') clean[field.key] = value;
    else if (field.required) return apiError('invalid_request', { field: field.key });
  }

  const host = createPluginHost(plugin, ctx);
  const node = await host.nodes.read(collection.id);
  if (!node) return apiError('not_found', { kind: 'collection' });
  const result = await connect(node, clean, host);
  return result.ok ? Response.json({ ok: true }) : pluginError(result.status, result.code, result.message);
}
