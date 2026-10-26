// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Node module hooks that compile `.svelte` files, and modules with runes, for
// server rendering outside Vite: the MCP server, its e2e spec and the scripts
// all load the public renderer, which renders blocks' Svelte components.
// Synchronous, so they serve module.register() and the in-thread
// module.registerHooks() Playwright uses alike. The scoped class hash is the
// compiler's default, the same the app's build gives, so the classes match.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { compile, compileModule } from 'svelte/compiler';

// The aliases, as the generated tsconfig's paths map them.
const ALIASES = [
  ['$lib', pathToFileURL(resolvePath(process.cwd(), 'src/lib') + '/').href],
  ['$tests', pathToFileURL(resolvePath(process.cwd(), 'tests') + '/').href],
];
/** A format a TypeScript loader beside this one doesn't know, so it leaves the module alone. */
const FORMAT = 'svelte';

export function resolve(specifier, context, next) {
  // `$lib/…` and `$tests/…` through the loader beside this one where it maps the tsconfig's paths, else here.
  const alias = ALIASES.find(([name]) => specifier === name || specifier.startsWith(name + '/'));
  const lib = !!alias;
  const attempt = (spec) => {
    const resolved = next(spec, context);
    return typeof resolved?.then === 'function' ? resolved.then(mark) : mark(resolved);
  };
  const fallback = () => attempt(alias[1] + specifier.slice(alias[0].length + 1) + (/\.[a-z]+$/.test(specifier) ? '' : '.ts'));
  try {
    const resolved = attempt(specifier);
    return lib && typeof resolved?.then === 'function' ? resolved.catch(fallback) : resolved;
  } catch (error) {
    if (!lib) throw error;
    return fallback();
  }
}

function mark(resolved) {
  return resolved.url.endsWith('.svelte') ? { ...resolved, format: FORMAT } : resolved;
}

const RUNES_MODULE = /\.svelte\.(?:js|ts)$/;

export function load(url, context, next) {
  if (url.endsWith('.svelte')) {
    const filename = fileURLToPath(url);
    const { js } = compile(readFileSync(filename, 'utf8'), { filename, generate: 'server', css: 'external' });
    return { format: 'module', source: js.code, shortCircuit: true };
  }
  if (!RUNES_MODULE.test(url.split('?')[0])) return next(url, context);
  const filename = fileURLToPath(url);
  const finish = (loaded) => {
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    const { js } = compileModule(source, { filename, generate: 'server' });
    return { format: 'module', source: js.code, shortCircuit: true };
  };
  const loaded = next(url, context);
  return typeof loaded?.then === 'function' ? loaded.then(finish) : finish(loaded);
}
