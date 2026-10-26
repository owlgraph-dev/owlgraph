// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's own page for a node an integration's source backs (docs/architecture/plugins.md,
// "Node views"): the plugin resolves what the body starts from before the
// render. A plugin that throws costs the page its body, never the page.
import { pluginFailed } from './pluginFailure.server';
import { pluginManifest } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import type { PluginNodeAction } from '$lib/plugins/api';
import type { CollectionRow } from '$lib/features/collections/server';
import { createPluginHost, type HostContext } from './host.server';
import type { NodeSourceAction, NodeSourceView } from './types';

// A path on this app: absolute, not protocol-relative, with no backslash or
// whitespace a browser could read as a way off it.
const APP_PATH = /^\/(?![/\\])[^\s\\]*$/;

/** An action the header may show: one addressed on this app or at the plugin's configured origin; null for anything else. */
export function checkedAction(action: PluginNodeAction, serviceOrigin: string | null): NodeSourceAction | null {
  if (typeof action.id !== 'string' || typeof action.label !== 'string' || action.label.trim() === '' || typeof action.href !== 'string') return null;
  if (APP_PATH.test(action.href)) return { id: action.id, label: action.label, href: action.href, external: false };
  try {
    const url = new URL(action.href);
    if (serviceOrigin !== null && url.origin === serviceOrigin && !url.username && !url.password) return { id: action.id, label: action.label, href: url.href, external: true };
  } catch {
    // not an address
  }
  return null;
}

/** For a viewer the caller has checked may read the collection. */
export async function resolveNodeView(collection: CollectionRow, ctx: HostContext & { canWrite: boolean }): Promise<NodeSourceView | null> {
  const plugin = collection.plugin;
  const manifest = plugin ? pluginManifest(plugin) : null;
  const hook = plugin ? pluginServer(plugin)?.nodeSource?.nodeView : undefined;
  if (!plugin || !manifest || !hook) return null;
  try {
    const host = createPluginHost(plugin, ctx);
    const node = await host.nodes.read(collection.id);
    if (!node) return null;
    const view = await hook(node, { canWrite: ctx.canWrite }, host);
    if (!view) return null;
    const serviceOrigin = (await host.upstream())?.origin ?? null;
    return {
      pluginId: plugin,
      label: manifest.label(),
      readsVia: view.readsVia,
      detail: view.detail,
      actions: view.actions.map((action) => checkedAction(action, serviceOrigin)).filter((a): a is NodeSourceAction => a !== null),
      data: view.data,
    };
  } catch (error) {
    pluginFailed(ctx.log, `node view for a '${plugin}' collection`, error);
    return null;
  }
}
