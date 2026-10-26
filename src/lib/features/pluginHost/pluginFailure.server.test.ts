// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { pluginFailed } from './pluginFailure.server';
import type { Logger } from '$lib/platform/logger.server';

describe("a plugin's failure in the log", () => {
  it('names its class and step, and nothing the error said', () => {
    const lines: Record<string, unknown>[] = [];
    const log = { error: vi.fn((fields: Record<string, unknown>) => lines.push(fields)) } as unknown as Logger;
    let thrown: unknown;
    try {
      JSON.parse('{"token":"SeCrEtToKeN", oops');
    } catch (error) {
      thrown = error;
    }
    pluginFailed(log, "block data for 'acmeFolder'", thrown);
    pluginFailed(log, 'node view', new Error('https://cloud.example/s/SeCrEtToKeN\nsecond line SeCrEtToKeN'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ errorClass: 'SyntaxError', message: "block data for 'acmeFolder' failed" });
    expect(JSON.stringify(lines)).not.toContain('SeCrEtToKeN');
    expect(String(lines[1].stack)).toMatch(/^\s+at /);
  });
});
