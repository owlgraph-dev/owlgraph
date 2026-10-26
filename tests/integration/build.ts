// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Whether build/handler.js is newer than every source file, for the HTTP tests
// (docs/guides/testing.md, "HTTP tests").
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HANDLER = 'build/handler.js';
// src/lib/paraglide is rewritten by every compile, so its sources count
// instead. A deleted file leaves no newer time behind: rebuild after deleting.
const SOURCES = ['src', 'messages', 'project.inlang', 'static', 'svelte.config.js', 'vite.config.ts', 'package-lock.json'];
// project.inlang/cache is the compiler's own, written by every compile too.
const GENERATED = new Set([join('src', 'lib', 'paraglide'), join('project.inlang', 'cache')]);
// Files under src/ that never reach a build: docs and tests.
const NOT_BUILT = /\.md$|\.test\.ts$|[\\/]e2e[\\/]/;

function newest(path: string): number {
  if (GENERATED.has(path) || NOT_BUILT.test(path)) return 0;
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = 0;
  for (const entry of readdirSync(path)) latest = Math.max(latest, newest(join(path, entry)));
  return latest;
}

export type BuildState = { ready: true } | { ready: false; reason: string };

export function buildState(): BuildState {
  if (!existsSync(HANDLER)) return { ready: false, reason: 'there is no build — run npm run build' };
  const built = statSync(HANDLER).mtimeMs;
  const stale = SOURCES.find((source) => newest(source) > built);
  if (stale) return { ready: false, reason: `the build is older than ${stale} — run npm run build` };
  return { ready: true };
}
