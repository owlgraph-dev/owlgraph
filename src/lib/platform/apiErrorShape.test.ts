// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// No adapter writes an error body of its own: apiErrors.ts builds every one
// (docs/architecture/routing.md, "Errors"). The routes with a body of their own — GraphQL's,
// the probe's, the CSP report's — are left out.

const ROOT = resolve(import.meta.dirname, '../../..');
const OWN_BODIES = ['src/routes/api/graphql/', 'src/routes/api/health/', 'src/routes/api/csp-report/'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(relative(ROOT, path).split('\\').join('/'));
  }
  return out;
}

const ADAPTERS = [...walk(join(ROOT, 'src/lib/features')), ...walk(join(ROOT, 'src/routes/api')), ...walk(join(ROOT, 'src/lib/plugins')), 'src/hooks.server.ts', 'src/mcp/server.ts'].filter(
  (f) =>
    !f.endsWith('.test.ts') &&
    !OWN_BODIES.some((own) => f.startsWith(own)) &&
    (/\/routes\/api\.[^/]+\.server\.ts$/.test(f) ||
      /^src\/routes\/api\/.*\+server\.ts$/.test(f) ||
      /\/routes\/(membership|documentUpload)\.server\.ts$/.test(f) ||
      /^src\/lib\/features\/pluginHost\/(dispatch|nodeSources)\.server\.ts$/.test(f) ||
      /^src\/lib\/plugins\/[^/]+\/server\/[^/]+\.server\.ts$/.test(f) ||
      f === 'src/hooks.server.ts' ||
      f === 'src/mcp/server.ts')
);

const OWN_ERROR_BODY = [
  /\bjson\(\s*\{[^}]*\berror\b/,
  // SvelteKit's error(), not respond.error().
  /(?<![.\w])error\(\s*[45]\d\d\s*,/,
  /new Response\([^)]*\berror\b/,
  /\.status\(\s*[45]\d\d\s*\)\.json\(/,
  // A plugin's route refuses through respond.error.
  /respond\.json\(\s*\{\s*error\b/,
];

describe('the API adapters', () => {
  it('are found', () => {
    expect(ADAPTERS.length).toBeGreaterThan(40);
    expect(ADAPTERS).toContain('src/lib/features/pages/routes/api.page.server.ts');
  });

  it('write no error body of their own', () => {
    const found: string[] = [];
    for (const f of ADAPTERS) {
      readFileSync(join(ROOT, f), 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (OWN_ERROR_BODY.some((re) => re.test(line))) found.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });
});
