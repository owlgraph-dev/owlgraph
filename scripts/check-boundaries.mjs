// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The import-boundary check, run by `npm run check` (docs/architecture/overview.md,
// "Entry points and boundary rules"; docs/architecture/plugins.md, "Boundaries"):
//   1. The MCP closure reaches neither SvelteKit, jsdom nor a stylesheet.
//   2. A feature is imported from outside only through an entry point, and an
//      adapter (routes/**, mcp.server.ts, graphql.server.ts) only from its channel.
//   3. No cycles between features, a feature's server and client halves apart.
//   4. The server graph follows LAYERS.
//   5. A module never imports its own feature's entry points.
//   6. A client entry point's closure loads in a browser: no server-only
//      package (SvelteKit externalizes a stray `node:` import silently, and
//      hydration crashes), no editor stack, no heavy package loaded eagerly.
//   7. Only the registry files in src/lib/plugins/ import a plugin, and no
//      plugin imports another.
//   8. A plugin imports the core through an allowlist, never calls fetch() on
//      the server, and each registry's closure stays within its audience.
//   9. The core never names a plugin.
//  10. No module cycle through a registry: it would leave a list half-initialised.
//  11. Only the routes, the server hooks and the shell import the shell.
//  12. Only tests import the test harness ($tests).
// `--root <dir>` checks another tree (src/lib/plugins/boundaries.test.ts).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg !== -1 && process.argv[rootArg + 1] ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const FEATURES_DIR = join(SRC, 'lib', 'features');

// Lower index, lower layer: a server half imports same-or-lower layers only.
const LAYERS = [
  ['auth'],
  ['nodes'],
  ['namespaces'],
  ['semantic', 'content', 'media'],
  ['pages', 'documents', 'collections', 'graph', 'search', 'query'],
  ['editor', 'site'],
  ['pluginHost'],
  ['reader'],
];
const layerOf = (feature) => LAYERS.findIndex((l) => l.includes(feature));

const ADAPTERS = [
  { name: 'Route adapter', pattern: /^lib\/features\/[^/]+\/routes\//, allowedFrom: /^(routes\/|hooks\.server$|lib\/shell\/)/ },
  { name: 'MCP adapter', pattern: /^lib\/features\/[^/]+\/mcp\.server$/, allowedFrom: /^mcp\// },
  { name: 'GraphQL adapter', pattern: /^lib\/features\/[^/]+\/graphql\.server$/, allowedFrom: /^lib\/features\/query\/graphql\// },
];
const adapterKind = (mod) => ADAPTERS.find((a) => a.pattern.test(mod)) ?? null;
const EXTRA_ENTRIES = { content: ['listing'], search: ['picker'], documents: ['create'] };
const entryNamesOf = (feature) => ['index', 'components', 'server', 'editor', ...(EXTRA_ENTRIES[feature] ?? [])];
const entryPointsOf = (feature) => [`lib/features/${feature}`, ...entryNamesOf(feature).map((name) => `lib/features/${feature}/${name}`)];
const isEntryPoint = (mod) => {
  const m = /^lib\/features\/([^/]+)\/([^/]+)$/.exec(mod);
  return !!m && entryNamesOf(m[1]).includes(m[2]);
};
const GRAPHQL_BUILDER = 'lib/features/query/graphql/builder.server';

const files = [];
(function walk(d) {
  for (const entry of readdirSync(d)) {
    const p = join(d, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'paraglide') walk(p);
    } else if (/\.(ts|js|mjs|svelte)$/.test(entry)) files.push(p);
  }
})(SRC);

const toPosix = (p) => p.split(sep).join('/');
const rel = (p) => toPosix(relative(SRC, p));
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

// { from, spec, to: 'lib/…' or null for a package, typeOnly: erased, so never
// loaded at runtime, dynamic: `import('…')`, a chunk of its own }
const edges = [];
// An import-shaped phrase in a comment is not an edge.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
for (const f of files) {
  const src = stripComments(readFileSync(f, 'utf8'));
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] ?? m[2] ?? m[3];
    let to = null;
    if (spec.startsWith('$lib/')) to = 'lib/' + spec.slice(5);
    else if (spec.startsWith('$tests/')) to = '../tests/' + spec.slice(7);
    else if (spec.startsWith('.')) to = rel(resolve(dirname(f), spec));
    if (to) to = to.replace(/\.(ts|js|mjs|svelte)$/, '');
    const typeOnly = /^(?:import|export)\s+type\s/.test(m[0]);
    const dynamic = m[2] !== undefined;
    edges.push({ from: rel(f).replace(/\.(ts|js|mjs|svelte)$/, ''), spec, to, typeOnly, dynamic });
  }
}

const problems = [];

// Rule 1.
{
  // SvelteKit is dev-only in the runtime image; jsdom (the logo upload's SVG
  // sanitizer) has an ESM-only dependency not every runner of the MCP server
  // can load; a stylesheet needs Vite.
  const FORBIDDEN = [
    { label: 'SvelteKit', test: (spec) => spec === '@sveltejs/kit' || spec.startsWith('@sveltejs/kit/') || spec.startsWith('$app/') },
    { label: 'jsdom', test: (spec) => spec === 'jsdom' || spec.startsWith('jsdom/') },
    { label: 'a stylesheet', test: (spec) => /\.css(?:\?|$)/.test(spec) },
  ];
  const byFrom = new Map();
  for (const e of edges) (byFrom.get(e.from) ?? byFrom.set(e.from, []).get(e.from)).push(e);
  const resolveModule = (to) => {
    // 'lib/foo' may be a file or a directory index
    for (const cand of [to, to + '/index']) if (byFrom.has(cand)) return cand;
    return to;
  };
  // Who first pulled each module in, so a violation names the whole chain.
  const parent = new Map();
  const chain = (mod) => {
    const path = [mod];
    while (parent.has(path[0])) path.unshift(parent.get(path[0]));
    return path.join(' -> ');
  };
  const seen = new Set();
  const stack = [...byFrom.keys()].filter((k) => k.startsWith('mcp/'));
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of byFrom.get(cur) ?? []) {
      if (e.typeOnly) continue;
      const hit = FORBIDDEN.find((f) => f.test(e.spec));
      if (hit) problems.push(`MCP closure reaches ${hit.label}: ${chain(cur)} imports '${e.spec}'`);
      if (e.to) {
        const next = resolveModule(e.to);
        if (!seen.has(next) && !parent.has(next)) parent.set(next, cur);
        stack.push(next);
      }
    }
  }
}

// Rules 2–6.
if (existsSync(FEATURES_DIR)) {
  const featureOf = (mod) => {
    const m = /^lib\/features\/([^/]+)/.exec(mod);
    return m ? m[1] : null;
  };
  const featureEdges = new Map(); // feature -> Set<feature>
  for (const e of edges) {
    if (!e.to) continue;
    const target = featureOf(e.to);
    if (!target) continue;
    const source = featureOf(e.from);
    // Adapters and tests compose several features, their own included, so
    // they take part in neither the self-import rule, the layering nor the
    // cycle graph.
    const fromTest = /\.(test|spec)$|\/e2e\//.test(e.from);
    const fromKind = adapterKind(e.from);
    const fromAdapter = !!fromKind || fromTest;
    if (source === target) {
      // Rule 5: a re-export cycle waiting to happen.
      const fromBarrel = isEntryPoint(e.from);
      const toEntry = entryPointsOf(target).includes(e.to);
      if (toEntry && !fromBarrel && !fromAdapter) problems.push(`Self-import through entry point: ${e.from} imports '${e.spec}' (use a relative sibling path)`);
      continue;
    }
    // Rule 2; a stylesheet is an asset, not a module boundary.
    const barrels = entryPointsOf(target);
    const toKind = adapterKind(e.to);
    if (toKind) {
      // An adapter of the same kind may share its helpers (requireAdmin).
      if (!toKind.allowedFrom.test(e.from) && fromKind !== toKind && !fromTest) {
        problems.push(`${toKind.name} imported outside its channel: ${e.from} imports '${e.spec}'`);
      }
    } else if (e.to === GRAPHQL_BUILDER && fromKind?.name === 'GraphQL adapter') {
      // The one module an adapter imports by direct path.
    } else if (!barrels.includes(e.to) && !e.to.endsWith('.css')) {
      problems.push(`Deep import into feature '${target}': ${e.from} imports '${e.spec}' (use $lib/features/${target}, …/components or …/server)`);
    }
    if (source && !e.typeOnly && !fromAdapter) {
      // A feature's server half and client half are separate nodes: the server
      // graph must be layered, the client graph (UI composition) only acyclic.
      // Type-only imports are erased and count for neither.
      const srcKind = /\.server$/.test(e.from) || /\/routes\//.test(e.from) ? 'server' : 'client';
      const tgtKind = e.to.endsWith('/server') ? 'server' : 'client';
      const from = `${source}/${srcKind}`;
      const to = `${target}/${tgtKind}`;
      (featureEdges.get(from) ?? featureEdges.set(from, new Set()).get(from)).add(to);
      // Rule 4.
      if (srcKind === 'server' && tgtKind === 'server') {
        const ls = layerOf(source);
        const lt = layerOf(target);
        if (ls === -1 || lt === -1) {
          problems.push(`Unknown feature in layer table: '${ls === -1 ? source : target}' (add it to LAYERS in scripts/check-boundaries.mjs)`);
        } else if (lt > ls) {
          problems.push(`Layer violation (server graph): '${source}' (layer ${ls}) imports higher-layer '${target}' (layer ${lt}): ${e.from} -> '${e.spec}'`);
        }
      }
    }
  }
  // Rule 6.
  {
    const byFrom = new Map();
    for (const e of edges) (byFrom.get(e.from) ?? byFrom.set(e.from, []).get(e.from)).push(e);
    const resolveModule = (to) => (byFrom.has(to) ? to : byFrom.has(to + '/index') ? to + '/index' : to);
    const SERVER_ONLY_PKGS = /^(node:|postgres$|dotenv|jsdom$|pdfjs-dist|express$)/;
    // Reached through a dynamic import, as a chunk of its own: postcss isn't
    // side-effect-free, so Rollup can't drop it from a chunk that merely might
    // use it, and a barrel would carry it onto every page.
    const HEAVY_CLIENT_PKGS = /^(postcss|postcss-selector-parser|postcss-value-parser)$/;
    // What an index.ts or components.ts reaches ships to every reader; the
    // editor feature is the one exempt.
    const EDITOR_ONLY_PKGS = /^(@tiptap(\/|$)|prosemirror-)/;
    const entries = [...byFrom.keys()].filter((k) => isEntryPoint(k) && !k.endsWith('/server'));
    for (const entry of entries) {
      const seen = new Set();
      // `lazy`: the path crossed a dynamic import, so the module costs the entry
      // nothing up front. A server-only package is flagged either way.
      const stack = [[entry, false]];
      while (stack.length) {
        const [cur, lazy] = stack.pop();
        const key = `${cur}|${lazy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const e of byFrom.get(cur) ?? []) {
          if (e.typeOnly) continue;
          if (SERVER_ONLY_PKGS.test(e.spec)) {
            problems.push(`Client entry point '${entry}' reaches server-only import: ${cur} imports '${e.spec}'`);
          }
          if (!lazy && !e.dynamic && EDITOR_ONLY_PKGS.test(e.spec) && !entry.startsWith('lib/features/editor/') && !entry.endsWith('/editor')) {
            problems.push(
              `Entry point '${entry}' reaches the editor stack: ${cur} imports '${e.spec}' — ` +
                `a Tiptap definition belongs behind the feature's editor.ts, editing UI in the editor feature (docs/architecture/overview.md)`
            );
          }
          if (!lazy && !e.dynamic && HEAVY_CLIENT_PKGS.test(e.spec)) {
            problems.push(
              `Client entry point '${entry}' eagerly loads heavy dependency '${e.spec}' (via ${cur}) — ` +
                `reach it through a dynamic import() so it gets its own chunk (docs/architecture/overview.md)`
            );
          }
          if (e.to && !e.to.endsWith('.css')) stack.push([resolveModule(e.to), lazy || e.dynamic]);
        }
      }
    }
  }
  // Rule 3.
  const color = new Map();
  const path = [];
  const visit = (f) => {
    color.set(f, 'grey');
    path.push(f);
    for (const g of featureEdges.get(f) ?? []) {
      if (color.get(g) === 'grey') problems.push(`Feature cycle: ${[...path.slice(path.indexOf(g)), g].join(' -> ')}`);
      else if (!color.has(g)) visit(g);
    }
    path.pop();
    color.set(f, 'black');
  };
  for (const f of featureEdges.keys()) if (!color.has(f)) visit(f);
}

// Rule 11: type-only imports count; tests are exempt.
{
  const SHELL = /^lib\/shell(?:\/|$)/;
  const MAY_IMPORT_SHELL = /^(?:routes\/|hooks\.server$|lib\/shell\/)/;
  for (const e of edges) {
    if (!e.to || !SHELL.test(e.to) || MAY_IMPORT_SHELL.test(e.from) || /\.(test|spec)$|\/e2e\//.test(e.from)) continue;
    problems.push(`The shell imported from below it: ${e.from} imports '${e.spec}' (only src/routes and src/hooks.server.ts import the shell; docs/architecture/overview.md)`);
  }
}

// Rule 12: the harness is the tests' (a spec's helpers in an e2e/ folder included).
{
  for (const e of edges) {
    if (!e.to || !e.to.startsWith('../tests/') || /\.(test|spec)$|\/e2e\//.test(e.from)) continue;
    problems.push(`The test harness imported outside a test: ${e.from} imports '${e.spec}' (docs/guides/testing.md)`);
  }
}

// Rules 7–10.
const PLUGINS_DIR = join(SRC, 'lib', 'plugins');
if (existsSync(PLUGINS_DIR)) {
  const PLUGIN_IDS = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const pluginOf = (mod) => {
    const m = /^lib\/plugins\/([^/]+)(?:\/|$)/.exec(mod);
    return m && PLUGIN_IDS.includes(m[1]) ? m[1] : null;
  };
  const REGISTRY = new Set([
    'lib/plugins/index',
    'lib/plugins/renderers',
    'lib/plugins/islands',
    'lib/plugins/nodeViews',
    'lib/plugins/editor',
    'lib/plugins/inputs.server',
    'lib/plugins/server',
    'lib/plugins/blocks.css',
  ]);
  const isTest = (mod) => /\.(test|spec)$|\/e2e\//.test(mod);

  // A stylesheet's @import is an edge too: a core sheet must not pull a
  // plugin's in past the registry's.
  const cssEdges = [];
  (function walkCss(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== 'paraglide') walkCss(p);
      } else if (entry.endsWith('.css')) {
        const css = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)) {
          const spec = m[1];
          let to = null;
          if (spec.startsWith('$lib/')) to = 'lib/' + spec.slice(5);
          else if (spec.startsWith('.')) to = rel(resolve(dirname(p), spec));
          cssEdges.push({ from: rel(p), spec, to });
        }
      }
    }
  })(SRC);

  // Rule 7.
  for (const e of [...edges, ...cssEdges]) {
    const target = e.to && pluginOf(e.to);
    if (!target) continue;
    const source = pluginOf(e.from);
    if (source === target) continue;
    if (source) problems.push(`Plugin '${source}' imports plugin '${target}': ${e.from} imports '${e.spec}' (plugins never import each other)`);
    else if (!REGISTRY.has(e.from)) {
      problems.push(`Plugin '${target}' imported outside the registry: ${e.from} imports '${e.spec}' (only src/lib/plugins/{index,renderers,islands,nodeViews,editor,inputs.server,server}.ts and blocks.css import a plugin — docs/architecture/plugins.md)`);
    }
  }

  // Rule 8. A stylesheet comes through the registry's blocks.css; the host's
  // pinned upstream client is a plugin's only network access.
  const PLUGIN_MAY_IMPORT = [
    /^lib\/plugins\/api$/,
    /^lib\/features\/content(?:\/index|\/editor|\/listing)?$/,
    /^lib\/design-system(?:\/index|\/icons|\/Icon)?$/,
    /^lib\/platform\/htmlEscape$/,
    /^lib\/platform\/i18n\/localizedText$/,
  ];
  const PLUGIN_MAY_IMPORT_PKG = /^(?:svelte(?:\/.+)?|@tiptap\/core|@tiptap\/pm\/.+|zod)$/;
  const PLUGIN_SERVER_PKG = /^(?:htmlparser2|node:(?:crypto|stream|stream\/web|buffer))$/;
  for (const e of edges) {
    const source = pluginOf(e.from);
    if (!source || isTest(e.from)) continue;
    if (e.to === null) {
      if (PLUGIN_MAY_IMPORT_PKG.test(e.spec) || (/\.server$/.test(e.from) && PLUGIN_SERVER_PKG.test(e.spec))) continue;
      problems.push(`Plugin '${source}' imports '${e.spec}': ${e.from} (outside a plugin's allowlist — docs/architecture/plugins.md)`);
    } else if (e.to.endsWith('.css')) {
      problems.push(`Plugin '${source}' imports a stylesheet: ${e.from} imports '${e.spec}' (the plugin registry's blocks.css carries it)`);
    } else if (!pluginOf(e.to) && !PLUGIN_MAY_IMPORT.some((re) => re.test(e.to))) {
      problems.push(`Plugin '${source}' imports outside its allowlist: ${e.from} imports '${e.spec}' (docs/architecture/plugins.md)`);
    }
  }
  for (const f of files) {
    const key = rel(f).replace(/\.(ts|js|mjs|svelte)$/, '');
    const source = pluginOf(key);
    if (!source || isTest(key) || !/\.server$/.test(key)) continue;
    if (/(?<![\w.$])fetch\s*\(/.test(stripComments(readFileSync(f, 'utf8')))) {
      problems.push(`Plugin '${source}' calls fetch() on the server: ${key} (the host's pinned upstream client is a plugin's only network access)`);
    }
  }

  // Rule 8, per registry. The manifests are pure data a script outside Vite
  // reads; the renderers run under the Node loader, which loads no stylesheet.
  const byFrom = new Map();
  for (const e of edges) (byFrom.get(e.from) ?? byFrom.set(e.from, []).get(e.from)).push(e);
  const resolveModule = (to) => (byFrom.has(to) ? to : byFrom.has(to + '/index') ? to + '/index' : to);
  /** Every runtime edge in `entry`'s closure, with the module that first pulled each one in. */
  function closure(entry) {
    const out = [];
    const parent = new Map();
    const seen = new Set();
    const stack = [entry];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of byFrom.get(cur) ?? []) {
        if (e.typeOnly) continue;
        out.push(e);
        if (e.to && !e.to.endsWith('.css')) {
          const next = resolveModule(e.to);
          if (!seen.has(next) && !parent.has(next)) parent.set(next, cur);
          stack.push(next);
        }
      }
    }
    const chain = (mod) => {
      const path = [mod];
      while (parent.has(path[0])) path.unshift(parent.get(path[0]));
      return path.join(' -> ');
    };
    return { edges: out, chain };
  }
  const SERVER_ONLY = /^(?:node:|postgres$|dotenv|jsdom$|pdfjs-dist|express$|htmlparser2$)/;
  const EDITOR_STACK = (e) => /^(?:@tiptap(?:\/|$)|prosemirror-)/.test(e.spec) || e.to === 'lib/features/content/editor';
  const AUDIENCES = [
    { registry: 'lib/plugins/index', what: 'the manifests', bans: ['pure', 'editor', 'server', 'svelte'] },
    { registry: 'lib/plugins/islands', what: 'the islands', bans: ['editor', 'server'] },
    { registry: 'lib/plugins/nodeViews', what: 'the node views', bans: ['editor', 'server'] },
    { registry: 'lib/plugins/renderers', what: 'the renderers', bans: ['editor', 'node', 'css'] },
    { registry: 'lib/plugins/editor', what: 'the editor halves', bans: ['server'] },
    { registry: 'lib/plugins/inputs.server', what: 'the agent inputs', bans: ['editor', 'css', 'svelte'] },
    { registry: 'lib/plugins/server', what: 'the server halves', bans: ['editor'] },
  ];
  for (const { registry, what, bans } of AUDIENCES) {
    if (!byFrom.has(registry)) continue;
    const { edges: reached, chain } = closure(registry);
    for (const e of reached) {
      if (bans.includes('editor') && EDITOR_STACK(e)) problems.push(`${what} reach the editor stack: ${chain(e.from)} imports '${e.spec}'`);
      if (bans.includes('server') && SERVER_ONLY.test(e.spec)) problems.push(`${what} reach a server-only package: ${chain(e.from)} imports '${e.spec}'`);
      if (bans.includes('node') && e.spec.startsWith('node:')) problems.push(`${what} reach a node: builtin: ${chain(e.from)} imports '${e.spec}'`);
      if (bans.includes('css') && /\.css(?:\?|$)/.test(e.spec)) problems.push(`${what} reach a stylesheet, which the Node loader renderDoc runs under cannot load: ${chain(e.from)} imports '${e.spec}'`);
      if (bans.includes('svelte') && /\.svelte(?:\?|$)/.test(e.spec)) problems.push(`${what} reach a Svelte component, which a script outside Vite cannot load: ${chain(e.from)} imports '${e.spec}'`);
      if (bans.includes('pure')) {
        const inside = e.to ? /^lib\/(?:plugins|paraglide)\//.test(e.to) : e.spec === 'zod';
        if (!inside) problems.push(`${what} are pure data, but ${chain(e.from)} imports '${e.spec}' (a manifest's runtime imports stay in src/lib/plugins/)`);
      }
    }
  }

  // Rule 10.
  for (const registry of REGISTRY) {
    for (const e of byFrom.get(registry) ?? []) {
      if (e.typeOnly || !e.to || !pluginOf(e.to)) continue;
      const start = resolveModule(e.to);
      const { edges: reached, chain } = closure(start);
      const back = reached.find((r) => r.to && (resolveModule(r.to) === registry || resolveModule(r.to) === start));
      if (back) problems.push(`Module cycle through the plugin registry: ${registry} -> ${chain(back.from)} -> '${back.spec}'`);
    }
  }

  // Rule 9: an id matches case-insensitively and as a prefix, so a block kind
  // named after a plugin counts. The docs may name plugins.
  if (PLUGIN_IDS.length) {
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const NAME = new RegExp(`(?<![a-z0-9])(?:${PLUGIN_IDS.map(escapeRe).join('|')})`, 'i');
    const TEXT = /\.(?:ts|js|mjs|cjs|svelte|css|json|html|sql|ya?ml|txt)$/;
    const stripSql = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    const scan = (file, text) => {
      const m = NAME.exec(text);
      if (!m) return;
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`Plugin name '${m[0]}' in the core: ${toPosix(relative(ROOT, file))}:${line} (the core reaches a plugin through the registry only — docs/architecture/plugins.md)`);
    };
    const scanTree = (dir, skip = () => false, prepare = (s) => s) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const p = join(dir, entry.name);
        if (skip(toPosix(relative(SRC, p)), entry)) continue;
        if (entry.isDirectory()) scanTree(p, skip, prepare);
        else if (TEXT.test(entry.name)) scan(p, prepare(readFileSync(p, 'utf8')));
      }
    };
    scanTree(SRC, (key, entry) =>
      entry.isDirectory()
        ? key === 'lib/paraglide' || (pluginOf(key) !== null && key.split('/').length === 3)
        : REGISTRY.has(key.replace(/\.ts$/, ''))
    );
    scanTree(join(ROOT, 'messages'));
    // SQL comments are prose, and an applied migration can't be edited.
    scanTree(join(ROOT, 'migrations'), () => false, stripSql);
    scanTree(join(ROOT, 'scripts'));
    scanTree(join(ROOT, 'tests'));
    const ROOT_CONFIG = /^(?:.+\.config\.(?:ts|js|mjs|cjs)|tsconfig.*\.json|package\.json|Dockerfile|docker-compose.*\.ya?ml|\.env.*\.example)$/;
    for (const name of readdirSync(ROOT)) {
      const p = join(ROOT, name);
      if (ROOT_CONFIG.test(name) && statSync(p).isFile()) scan(p, readFileSync(p, 'utf8'));
    }
    const inlang = join(ROOT, 'project.inlang', 'settings.json');
    if (existsSync(inlang)) scan(inlang, readFileSync(inlang, 'utf8'));
  }
}

if (problems.length) {
  console.error(`check-boundaries: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-boundaries: ok (${files.length} files, ${edges.length} imports)`);
