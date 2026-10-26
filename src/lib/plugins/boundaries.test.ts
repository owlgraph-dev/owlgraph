// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Runs scripts/check-boundaries.mjs with `--root` on fixture trees around a
// made-up plugin: a clean tree passes, and each rule fires on the one violation
// planted for it.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECKER = resolve(__dirname, '../../../scripts/check-boundaries.mjs');

/** A tree the rules accept: a plugin `acme` the core reads through the registry. */
const CLEAN: Record<string, string> = {
  'src/lib/plugins/api.ts': 'export function definePlugin<M>(m: M): M { return m; }\n',
  'src/lib/plugins/index.ts': "import { acme } from './acme';\nexport const PLUGINS = [acme];\n",
  'src/lib/plugins/renderers.ts': "import { renderers } from './acme/renderers';\nexport const PLUGIN_RENDERERS = { ...renderers };\n",
  'src/lib/plugins/blocks.css': "@import './acme/acme.css';\n",
  'src/lib/plugins/acme/index.ts': "import { definePlugin } from '$lib/plugins/api';\nexport const acme = definePlugin({ blocks: [] });\n",
  'src/lib/plugins/acme/renderers.ts': "import { wrapperHtml } from '$lib/features/content';\nexport const renderers = { block: wrapperHtml };\n",
  'src/lib/plugins/acme/acme.css': '.block { color: inherit; }\n',
  'src/lib/plugins/acme/hash.server.ts': "import { createHash } from 'node:crypto';\nexport const hash = (s: string) => createHash('sha256').update(s).digest('hex');\n",
  'src/lib/features/content/index.ts': "import { PLUGINS } from '$lib/plugins';\nexport const KINDS = PLUGINS;\nexport const wrapperHtml = () => '';\n",
  'src/lib/features/content/blocks.css': "@import '../../plugins/blocks.css';\n",
  'migrations/0001_init.sql': '-- acme arrives later; this comment may say so\ncreate table t (id int);\n',
  'messages/en.json': '{ "hello": "Hello" }\n',
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs the checker on CLEAN with `changes` applied. */
function check(changes: Record<string, string> = {}): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'boundaries-'));
  dirs.push(root);
  for (const [path, text] of Object.entries({ ...CLEAN, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const run = spawnSync(process.execPath, [CHECKER, '--root', root], { encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

function expectProblem(changes: Record<string, string>, message: string) {
  const { status, output } = check(changes);
  expect(status, output).toBe(1);
  expect(output).toContain(message);
}

describe('check-boundaries, plugin rules', () => {
  it('passes a tree that keeps them', () => {
    const { status, output } = check();
    expect(status, output).toBe(0);
    expect(output).toContain('check-boundaries: ok');
  });

  it('7: refuses a core module importing a plugin', () => {
    expectProblem({ 'src/lib/features/content/leak.ts': "import { acme } from '$lib/plugins/acme';\nexport const a = acme;\n" }, "Plugin 'acme' imported outside the registry");
  });

  it("7: refuses a core stylesheet importing a plugin's", () => {
    expectProblem({ 'src/lib/features/content/blocks.css': "@import '../../plugins/acme/acme.css';\n" }, "Plugin 'acme' imported outside the registry");
  });

  it('7: refuses a plugin importing another', () => {
    expectProblem({ 'src/lib/plugins/beta/index.ts': "import { acme } from '../acme';\nexport const beta = acme;\n" }, "Plugin 'beta' imports plugin 'acme'");
  });

  it('8: refuses a core module outside the allowlist', () => {
    expectProblem({ 'src/lib/plugins/acme/rows.ts': "import { sql } from '$lib/platform/db.server';\nexport const rows = sql;\n" }, "Plugin 'acme' imports outside its allowlist");
  });

  it('8: refuses a network builtin, even on the server', () => {
    expectProblem({ 'src/lib/plugins/acme/net.server.ts': "import https from 'node:https';\nexport const net = https;\n" }, "Plugin 'acme' imports 'node:https'");
  });

  it('8: refuses a stylesheet import', () => {
    expectProblem({ 'src/lib/plugins/acme/view.ts': "import './acme.css';\nexport const view = 1;\n" }, "Plugin 'acme' imports a stylesheet");
  });

  it("8: lets a plugin draw with the content feature's shared listings, and nothing deeper", () => {
    const listing = {
      'src/lib/features/content/listing.ts': "export { default as EntryList } from './listing/EntryList.svelte';\n",
      'src/lib/features/content/listing/EntryList.svelte': '<script lang="ts">let { rows } = $props();</script>\n<ul>{#each rows as row}<li>{row}</li>{/each}</ul>\n',
    };
    const drawn = { 'src/lib/plugins/acme/View.svelte': "<script lang=\"ts\">import { EntryList } from '$lib/features/content/listing';</script>\n<EntryList rows={[]} />\n" };
    const { status, output } = check({ ...listing, ...drawn });
    expect(status, output).toBe(0);
    // Put together here, so the checker reading this file sees no import of it.
    const deep = ['$lib/features/content/listing', 'EntryList.svelte'].join('/');
    expectProblem(
      { ...listing, 'src/lib/plugins/acme/View.svelte': `<script lang="ts">import EntryList from '${deep}';</script>\n<EntryList rows={[]} />\n` },
      "Plugin 'acme' imports outside its allowlist"
    );
  });

  it('8: keeps stylesheets out of the renderers, whichever module brings one', () => {
    expectProblem(
      {
        'src/lib/features/content/listing.ts': "import './listing/listing.css';\nexport const EntryList = 1;\n",
        'src/lib/features/content/listing/listing.css': '.listing { color: inherit; }\n',
        'src/lib/plugins/acme/renderers.ts': "import { wrapperHtml } from '$lib/features/content';\nimport { EntryList } from '$lib/features/content/listing';\nexport const renderers = { block: wrapperHtml, list: EntryList };\n",
      },
      "the renderers reach a stylesheet, which the Node loader renderDoc runs under cannot load: lib/plugins/renderers -> lib/plugins/acme/renderers -> lib/features/content/listing imports './listing/listing.css'"
    );
  });

  it('8: refuses fetch() on the server', () => {
    expectProblem({ 'src/lib/plugins/acme/call.server.ts': "export const call = () => fetch('https://example.com');\n" }, "Plugin 'acme' calls fetch() on the server");
  });

  it('8: keeps the editor stack out of the islands', () => {
    expectProblem(
      {
        'src/lib/plugins/islands.ts': "import { island } from './acme/island';\nexport const PLUGIN_ISLANDS = { island };\n",
        'src/lib/plugins/acme/island.ts': "import { Editor } from '@tiptap/core';\nexport const island = Editor;\n",
      },
      'the islands reach the editor stack'
    );
  });

  it('8: keeps the editor stack out of the node views', () => {
    expectProblem(
      {
        'src/lib/plugins/nodeViews.ts': "import { views } from './acme/nodeViews';\nexport const PLUGIN_NODE_VIEWS = [views];\n",
        'src/lib/plugins/acme/nodeViews.ts': "import { Editor } from '@tiptap/core';\nexport const views = { id: 'acme', collection: Editor };\n",
      },
      'the node views reach the editor stack'
    );
  });

  it('8: keeps the editor stack out of the server halves', () => {
    expectProblem(
      {
        'src/lib/plugins/server.ts': "import { server } from './acme/server';\nexport const PLUGIN_SERVERS = [server];\n",
        'src/lib/plugins/acme/server.ts': "import { getSchema } from '@tiptap/core';\nexport const server = { id: 'acme', schema: getSchema };\n",
      },
      'the server halves reach the editor stack'
    );
  });

  it('8: keeps the manifests pure data', () => {
    expectProblem(
      { 'src/lib/plugins/acme/index.ts': "import { definePlugin } from '$lib/plugins/api';\nimport { KINDS } from '$lib/features/content';\nexport const acme = definePlugin({ blocks: KINDS });\n" },
      'the manifests are pure data'
    );
  });

  it('8: keeps Svelte components out of the manifests, which scripts outside Vite read', () => {
    expectProblem(
      {
        'src/lib/plugins/acme/index.ts': "import { definePlugin } from '$lib/plugins/api';\nimport Card from './Card.svelte';\nexport const acme = definePlugin({ blocks: [], card: Card });\n",
        'src/lib/plugins/acme/Card.svelte': '<p>card</p>\n',
      },
      'the manifests reach a Svelte component'
    );
  });

  it('8: keeps the editor stack, stylesheets and Svelte components out of the agent inputs', () => {
    const registry = { 'src/lib/plugins/inputs.server.ts': "import { inputs } from './acme/inputs.server';\nexport const PLUGIN_INPUT_SHAPES = inputs;\n" };
    expectProblem(
      { ...registry, 'src/lib/plugins/acme/inputs.server.ts': "import { getSchema } from '@tiptap/core';\nexport const inputs = [getSchema];\n" },
      'the agent inputs reach the editor stack'
    );
    expectProblem(
      {
        ...registry,
        'src/lib/plugins/acme/inputs.server.ts': "import Card from './Card.svelte';\nexport const inputs = [Card];\n",
        'src/lib/plugins/acme/Card.svelte': '<p>card</p>\n',
      },
      'the agent inputs reach a Svelte component'
    );
  });

  it('9: refuses the name in core code, as a prefix and in any case', () => {
    expectProblem({ 'src/lib/features/content/kinds.ts': "export const kind = 'AcmeFolder';\n" }, "Plugin name 'Acme' in the core: src/lib/features/content/kinds.ts:1");
  });

  it("9: refuses the name in a migration's statement, not in its comment", () => {
    expectProblem({ 'migrations/0002_seed.sql': "-- seeds\ninsert into t values ('acme');\n" }, "Plugin name 'acme' in the core: migrations/0002_seed.sql:2");
  });

  it('9: refuses the name in the message catalogs', () => {
    expectProblem({ 'messages/en.json': '{ "acme_label": "x" }\n' }, "Plugin name 'acme' in the core: messages/en.json:1");
  });

  it('10: refuses a module cycle through a registry', () => {
    expectProblem(
      { 'src/lib/features/content/index.ts': "import { PLUGINS } from '$lib/plugins';\nimport { PLUGIN_RENDERERS } from '$lib/plugins/renderers';\nexport const KINDS = [PLUGINS, PLUGIN_RENDERERS];\nexport const wrapperHtml = () => '';\n" },
      'Module cycle through the plugin registry: lib/plugins/renderers'
    );
  });
});

// The MCP server renders plugin blocks under Node too: no stylesheet may reach it.
describe('check-boundaries, the MCP closure', () => {
  it('1: refuses a stylesheet the MCP server would load', () => {
    expectProblem(
      {
        'src/mcp/server.ts': "import { KINDS } from '$lib/features/content';\nexport const tools = KINDS;\n",
        'src/lib/features/content/index.ts': "import { PLUGINS } from '$lib/plugins';\nimport './look.css';\nexport const KINDS = PLUGINS;\nexport const wrapperHtml = () => '';\n",
        'src/lib/features/content/look.css': '.look { color: inherit; }\n',
      },
      "MCP closure reaches a stylesheet: mcp/server -> lib/features/content/index imports './look.css'"
    );
  });
});
