// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugins' manifests, one line per plugin (docs/architecture/plugins.md, "The registry"):
// pure data, so the content catalogue, the settings tree and Node tooling read
// it at no cost. The registry files here are the only core modules that import
// a plugin (scripts/check-boundaries.mjs, rule 7).
import type { BlockFacets } from '$lib/features/content';
import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import type { PluginBlockKind, PluginConnectionsManifest, PluginManifest, PluginSettingsSection } from './api';
import { nextcloud } from './nextcloud';

export const PLUGINS = [nextcloud] as const;

// Widened to the contract's type: the literal types omit what no plugin declares.
const manifests: readonly PluginManifest[] = PLUGINS;

export function pluginManifest(id: string): PluginManifest | null {
  return manifests.find((p) => p.id === id) ?? null;
}

/** A plugin's name in the interface, or its id for one no longer registered. */
export function pluginLabel(id: string): string {
  return pluginManifest(id)?.label() ?? id;
}

export const PLUGINS_WITH_SETTINGS: readonly (PluginManifest & { settings: PluginSettingsSection })[] = manifests.filter(
  (p): p is PluginManifest & { settings: PluginSettingsSection } => p.settings !== undefined
);

export const PLUGINS_WITH_CONNECTIONS: readonly (PluginManifest & { connections: PluginConnectionsManifest })[] = manifests.filter(
  (p): p is PluginManifest & { connections: PluginConnectionsManifest } => p.connections !== undefined
);

type PluginKind = (typeof PLUGINS)[number]['blocks'][number];

/** In registry order; the content catalogue appends them to its own. */
export const PLUGIN_BLOCK_KINDS: readonly PluginKind[] = PLUGINS.flatMap((plugin) => plugin.blocks);

/** A table keyed by this type covers every plugin block kind. */
export type PluginBlockKindName = PluginKind['name'];

// Widened too: the literal type is never while no plugin adds a block.
const kinds: readonly PluginBlockKind[] = PLUGIN_BLOCK_KINDS;

// The plugins' kinds, which the catalogue and render tests set apart from the core's.
export const PLUGIN_BLOCK_KIND_NAMES: ReadonlySet<string> = new Set(kinds.map((kind) => kind.name));

const kindOwners: ReadonlyMap<string, string> = new Map(manifests.flatMap((p) => p.blocks.map((kind) => [kind.name, p.id] as const)));

/** The plugin that adds a block kind, or null for a core kind. */
export function pluginOfBlockKind(kind: string): string | null {
  return kindOwners.get(kind) ?? null;
}

/**
 * A block kind of a plugin that left the registry, kept so the blocks it left in
 * pages still say whose they were (docs/guides/writing-a-plugin.md, "Removing a plugin").
 */
export interface RetiredBlockKind {
  kind: string;
  plugin: string;
  label: LocalizedText;
}

/** Newest last. */
export const RETIRED_BLOCK_KINDS: readonly RetiredBlockKind[] = [];

export function retiredBlockKind(kind: string): RetiredBlockKind | null {
  return RETIRED_BLOCK_KINDS.find((retired) => retired.kind === kind) ?? null;
}

export const PLUGIN_BLOCK_FACETS: Readonly<Record<string, BlockFacets>> = Object.fromEntries(
  kinds.flatMap((kind) => (kind.facets ? [[kind.name, kind.facets] as const] : []))
);
