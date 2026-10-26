// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Runs a script as `npm run` does, in a process of its own, with only the
// environment the test gives it, so a developer's shell can't change it.
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

export interface ScriptRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `scripts/<script>` with `args`, its environment this process's plus `env` (a key set to undefined is removed). */
export function runScript(script: string, args: string[] = [], env: Record<string, string | undefined> = {}): Promise<ScriptRun> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...env })) if (value !== undefined) merged[key] = value;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, '--tsconfig', 'tsconfig.tsx.json', path.join('scripts', script), ...args], {
      cwd: ROOT,
      env: merged,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
