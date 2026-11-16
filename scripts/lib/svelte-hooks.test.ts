// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { compileModule } from 'svelte/compiler';
import { load } from './svelte-hooks.mjs';

// A module with runes of its own, written in TypeScript, as the design-system
// controls a block draws bring with them.
const FILE = resolve('src/lib/design-system/toast.svelte.ts');
const URL = pathToFileURL(FILE).href;
const TYPESCRIPT = readFileSync(FILE, 'utf8');

/** The hook's load, with the loader after it handing on `source` as a module. */
const loadWith = (source: string) => load(URL, {}, () => ({ format: 'module', source })) as { format: string; source: string };

describe('the Svelte loader hook, on a `.svelte.ts` module', () => {
  it('compiles it when the loader before it hands it on still as TypeScript', () => {
    // What tsx 4.23 and Node 26 hand on: the file as it is, its format `module`.
    expect(() => compileModule(TYPESCRIPT, { filename: FILE, generate: 'server' })).toThrow(/Unexpected token/);
    const loaded = loadWith(TYPESCRIPT);
    expect(loaded.format).toBe('module');
    expect(loaded.source).not.toMatch(/export type|export interface/);
  });

  it('compiles it the same when the TypeScript is already stripped', () => {
    const stripped = transformSync(TYPESCRIPT, { loader: 'ts', format: 'esm' }).code;
    expect(loadWith(stripped).source).toBe(loadWith(TYPESCRIPT).source);
  });
});
