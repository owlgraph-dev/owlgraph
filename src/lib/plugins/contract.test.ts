// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin contract (docs/architecture/plugins.md), held over every registered plugin.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDoc } from '$lib/features/content/server';
import { PLUGINS, PLUGIN_BLOCK_KINDS } from './index';
import { PLUGIN_RENDERERS } from './renderers';
import { pluginEditorBlock } from './editor';
import { PLUGIN_SERVERS } from './server';
import { PLUGIN_NODE_VIEWS } from './nodeViews';
import { PLUGIN_INPUT_KINDS, pluginInputKindOfBlock, pluginInputOf } from './inputs.server';
import { blockShape } from '$lib/features/content/server';
import type { BlockRenderer } from '$lib/features/content';
import type { PluginBlockKind, PluginManifest } from './api';

const plugins: readonly PluginManifest[] = PLUGINS;
const kinds: readonly PluginBlockKind[] = PLUGIN_BLOCK_KINDS;
const renderers: Readonly<Record<string, BlockRenderer>> = PLUGIN_RENDERERS;

describe('plugin contract', () => {
  it('registers every plugin directory, under its directory name', () => {
    const dirs = readdirSync(resolve(__dirname), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(plugins.map((p) => p.id).sort()).toEqual(dirs.sort());
    for (const plugin of plugins) {
      expect(plugin.id).toMatch(/^[a-z][a-z0-9-]{1,31}$/);
      expect(plugin.label()).not.toBe('');
    }
  });

  it('adds each block kind once', () => {
    const names = kinds.map((k) => k.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names each agent input with a kind of its own — no other plugin's, no core block's — which the block taxonomy takes", () => {
    expect(new Set(PLUGIN_INPUT_KINDS).size).toBe(PLUGIN_INPUT_KINDS.length);
    for (const kind of PLUGIN_INPUT_KINDS) {
      expect(pluginInputOf(kind), kind).not.toBeNull();
      // The joined union knows the kind: an input of it parses as far as its kind goes.
      const parsed = blockShape.safeParse({ kind });
      expect(parsed.success || parsed.error.issues.every((issue) => issue.path[0] !== 'kind'), kind).toBe(true);
    }
  });

  it('makes each agent input a block kind of its own plugin, one input per kind', () => {
    for (const kind of PLUGIN_INPUT_KINDS) {
      const { plugin, input } = pluginInputOf(kind)!;
      expect(plugins.find((p) => p.id === plugin)?.blocks.map((b) => b.name), kind).toContain(input.block);
      expect(pluginInputKindOfBlock(input.block), kind).toBe(kind);
    }
  });

  it('gives each kind that embeds a node an attr it declares for the node', () => {
    for (const kind of kinds) {
      if (!kind.embeds) continue;
      expect(Object.keys(kind.sample.attrs ?? {}), kind.name).toContain(kind.embeds.nodeAttr);
    }
  });

  it('declares settings fields with distinct keys, and at most one origin', () => {
    for (const plugin of plugins) {
      const fields = plugin.settings?.fields ?? [];
      expect(new Set(fields.map((f) => f.key)).size, plugin.id).toBe(fields.length);
      for (const field of fields) {
        expect(field.key, plugin.id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        if (field.kind === 'number') expect(field.min <= field.default && field.default <= field.max, `${plugin.id}.${field.key}`).toBe(true);
      }
      expect(fields.filter((f) => f.kind === 'origin').length, plugin.id).toBeLessThanOrEqual(1);
    }
  });

  for (const server of PLUGIN_SERVERS) {
    describe(`${server.id} (server half)`, () => {
      const plugin = plugins.find((p) => p.id === server.id);

      it('belongs to a registered plugin, once', () => {
        expect(plugin).toBeDefined();
        expect(PLUGIN_SERVERS.filter((s) => s.id === server.id)).toHaveLength(1);
      });

      it('declares well-formed, distinct routes', () => {
        const seen = new Set<string>();
        for (const route of server.routes ?? []) {
          const segments = route.path.split('/');
          for (const segment of segments) expect(segment, route.path).toMatch(/^(?::[a-z][a-zA-Z0-9]*|[a-z0-9][a-z0-9-]*)$/);
          // Two routes that match the same requests: the second would never run.
          const shape = `${route.method} ${segments.map((s) => (s.startsWith(':') ? ':' : s)).join('/')}`;
          expect(seen.has(shape), shape).toBe(false);
          seen.add(shape);
        }
      });

      it('resolves block data for its own block kinds only', () => {
        const own = new Set((plugin?.blocks ?? []).map((k) => k.name));
        for (const kind of Object.keys(server.blockData ?? {})) expect(own.has(kind), kind).toBe(true);
      });

      it('connects only a source its manifest offers a form for', () => {
        if (server.nodeSource?.connectCollection) expect(plugin?.sources?.collection?.fields.length).toBeGreaterThan(0);
      });

      it("carries a person's connection exactly when its manifest offers one, for a service it has an address of", () => {
        expect(server.connections !== undefined, 'server.connections ⇔ manifest.connections').toBe(plugin?.connections !== undefined);
        if (!plugin?.connections) return;
        expect(plugin.connections.kinds.length).toBeGreaterThan(0);
        expect(plugin.connections.intro()).toBeTruthy();
        // A connection is made against the plugin's one origin: without one there is nothing to connect to.
        expect(plugin.settings?.fields.filter((f) => f.kind === 'origin')).toHaveLength(1);
      });
    });
  }

  it("draws a node's own page exactly where its server half resolves what the body starts from", () => {
    for (const views of PLUGIN_NODE_VIEWS) {
      expect(plugins.some((p) => p.id === views.id), views.id).toBe(true);
      expect(PLUGIN_NODE_VIEWS.filter((v) => v.id === views.id), views.id).toHaveLength(1);
    }
    for (const plugin of plugins) {
      const resolves = PLUGIN_SERVERS.find((s) => s.id === plugin.id)?.nodeSource?.nodeView !== undefined;
      const draws = PLUGIN_NODE_VIEWS.find((v) => v.id === plugin.id)?.collection !== undefined;
      expect(draws, `${plugin.id}: node views' collection ⇔ nodeSource.nodeView`).toBe(resolves);
    }
  });

  it('offers connections only from a plugin that has a server half to carry them', () => {
    for (const plugin of plugins) {
      if (plugin.connections) expect(PLUGIN_SERVERS.some((s) => s.id === plugin.id), plugin.id).toBe(true);
    }
  });

  for (const kind of kinds) {
    describe(kind.name, () => {
      it('has a page renderer and an editor half', () => {
        expect(renderers[kind.name]).toBeTypeOf('function');
        expect(pluginEditorBlock(kind.name)?.label()).toBeTruthy();
      });

      it('renders its sample on the page', () => {
        expect(kind.sample.type).toBe(kind.name);
        const { html } = renderDoc({ type: 'doc', content: [kind.sample] });
        if (kind.addressable && !kind.transient) expect(html).toContain(`data-block-id="${String(kind.sample.attrs?.blockId)}"`);
        expect(html).not.toMatch(/\sstyle\s*=/);
      });
    });
  }
});
