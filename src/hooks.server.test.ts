// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import type { RequestEvent } from '@sveltejs/kit';
import { loggerOptions } from '$lib/platform/logger.server';

// The server hooks outside SvelteKit: $app/env is the one module of its they need.
vi.mock('$app/env', () => ({ browser: false, dev: false, building: false, version: 'test' }));
const { handleError } = await import('./hooks.server');

type Caught = Parameters<typeof handleError>[0];

/** handleError for one caught error, with the log lines it wrote (docs/architecture/logging.md, "Errors"). */
async function handle(kind: Caught['kind'], error: unknown) {
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'debug' }, { write: (line: string) => void lines.push(line) });
  const event = { locals: { log, reqId: 'req-1' } } as unknown as RequestEvent;
  const result = await handleError({ kind, error, event } as Caught);
  return { result, events: lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe('handleError', () => {
  it('passes over an error(...) the app raised: its status and message stand, and http.request alone records it', async () => {
    const { result, events } = await handle('app', { status: 404, message: 'Page not found' });
    expect(result).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("logs SvelteKit's own 404 as expected, at info, and gives it the request's id", async () => {
    const { result, events } = await handle('framework', { status: 404, message: 'Not Found' });
    expect(result).toEqual({ id: 'req-1' });
    expect(events).toEqual([expect.objectContaining({ event: 'error.expected', level: 'info', status: 404, kind: 'framework' })]);
  });

  it("logs SvelteKit's other refusals as expected, at warn", async () => {
    const { events } = await handle('framework', { status: 405, message: 'Method Not Allowed' });
    expect(events).toEqual([expect.objectContaining({ event: 'error.expected', level: 'warn', status: 405 })]);
  });

  it('logs anything else as unhandled, its cause in the log and a generic message for the reader', async () => {
    const { result, events } = await handle('unknown', new TypeError('the pool is closed'));
    expect(result).toEqual({ message: 'An unexpected error occurred.', id: 'req-1' });
    expect(events).toEqual([expect.objectContaining({ event: 'error.unhandled', level: 'error', errorClass: 'TypeError', message: 'the pool is closed' })]);
  });
});
