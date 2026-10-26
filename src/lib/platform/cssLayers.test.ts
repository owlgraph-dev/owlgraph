// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { LAYER_ORDER, inLayer } from './cssLayers';

const ROOT = resolve(__dirname, '../../..');

// A rule outside a layer block would outrank every per-page override.
const CORE_SHEETS = [
  'src/app.css',
  'src/lib/features/content/blocks/canvasContent.css',
  'src/lib/features/content/blocks/callout/callout.css',
  'src/lib/features/content/blocks/table/table.css',
  'src/lib/features/content/blocks/grid/grid.css',
  'src/lib/features/content/blocks/flex/flex.css',
  'src/lib/features/content/blocks/query/query.css',
  'src/lib/features/content/blocks/quickLink/quickLink.css',
  'src/lib/features/content/listing/entryList.css',
  'src/lib/features/content/listing/documentEntry.css',
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The plugins' block sheets, followed through the registry's @imports: a sheet
// of imports alone is followed, a sheet with rules is a block's.
const PLUGIN_REGISTRY_SHEET = resolve(ROOT, 'src/lib/plugins/blocks.css');
const IMPORT = /@import\s+['"]([^'"]+)['"]\s*;/g;
function blockSheets(sheet: string): string[] {
  const css = stripComments(readFileSync(sheet, 'utf8'));
  const imports = [...css.matchAll(IMPORT)].map((m) => resolve(dirname(sheet), m[1]));
  return css.replace(IMPORT, '').trim() === '' ? imports.flatMap(blockSheets) : [sheet];
}
const PLUGIN_SHEETS = blockSheets(PLUGIN_REGISTRY_SHEET).map((sheet) => relative(ROOT, sheet).split('\\').join('/'));
const LAYERED_SHEETS = [...CORE_SHEETS, ...PLUGIN_SHEETS];

/** The top-level statements of a sheet: `@layer …;` statements and `@layer name {` block openers, in order. */
function topLevel(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (depth === 0 && ch === ';') {
      out.push(css.slice(start, i + 1).trim());
      start = i + 1;
    } else if (ch === '{') {
      if (depth === 0) {
        out.push(css.slice(start, i).trim() + ' {');
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) start = i + 1;
      expect(depth, `unbalanced braces near index ${i}`).toBeGreaterThanOrEqual(0);
    }
  }
  expect(depth, 'braces balance at end of sheet').toBe(0);
  expect(css.slice(start).trim(), 'nothing dangles after the last block').toBe('');
  return out;
}

describe('cascade layers', () => {
  it('names the order once, for every sheet to repeat', () => {
    expect(LAYER_ORDER).toBe('@layer base, theme, custom;');
  });

  it('inLayer wraps, and leaves empty css empty', () => {
    expect(inLayer('theme', '.a{--x:1}')).toBe('@layer theme{.a{--x:1}}');
    expect(inLayer('custom', '')).toBe('');
  });

  for (const sheet of LAYERED_SHEETS) {
    it(`${sheet} opens with the order statement and keeps every rule in a layer`, () => {
      const statements = topLevel(stripComments(readFileSync(resolve(ROOT, sheet), 'utf8')));
      expect(statements[0]).toBe(LAYER_ORDER);
      for (const statement of statements.slice(1)) {
        expect(statement, `top-level statement in ${sheet}`).toMatch(/^@layer (base|theme) \{$/);
      }
    });
  }

  it('declares the three kind pins in the theme layer, nothing else', () => {
    const pinned = CORE_SHEETS.filter((sheet) =>
      topLevel(stripComments(readFileSync(resolve(ROOT, sheet), 'utf8'))).includes('@layer theme {')
    );
    expect(pinned.sort()).toEqual(
      [
        'src/lib/features/content/blocks/table/table.css',
        'src/lib/features/content/blocks/query/query.css',
        'src/lib/features/content/blocks/quickLink/quickLink.css',
      ].sort()
    );
  });
});
