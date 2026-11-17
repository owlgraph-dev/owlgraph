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
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { compile, compileModule } from 'svelte/compiler';

/** A format a TypeScript loader beside this one doesn't know, so it leaves the module alone. */
const FORMAT = 'svelte';

// #lib/… and #tests/… are package.json's subpath imports, which Node resolves.
export function resolve(specifier, context, next) {
  const resolved = next(specifier, context);
  return typeof resolved?.then === 'function' ? resolved.then(mark) : mark(resolved);
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
  const path = url.split('?')[0];
  if (!RUNES_MODULE.test(path)) return next(url, context);
  const filename = fileURLToPath(url);
  const typescript = path.endsWith('.ts');
  const finish = (loaded) => {
    let source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    // The Svelte compiler reads JavaScript only, and a `.svelte.ts` module can
    // arrive here still as TypeScript, whatever its format says: a TypeScript
    // loader may leave it to Node's own type stripping, which comes after these
    // hooks. Stripping its types here, as Vite does before compiling one, holds
    // either way; on JavaScript it changes nothing.
    if (typescript) source = transformSync(source, { loader: 'ts', format: 'esm', sourcefile: filename }).code;
    const { js } = compileModule(source, { filename, generate: 'server' });
    return { format: 'module', source: js.code, shortCircuit: true };
  };
  const loaded = next(url, context);
  return typeof loaded?.then === 'function' ? loaded.then(finish) : finish(loaded);
}
