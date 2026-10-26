// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rateLimit';

const WINDOW_MS = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a fixed-window limiter', () => {
  it('allows a key up to its limit, then refuses it with the time left in its window', () => {
    const limiter = new RateLimiter(3, WINDOW_MS);
    for (let i = 0; i < 3; i++) expect(limiter.check('192.0.2.1')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('192.0.2.1')).toEqual({ allowed: false, retryAfterMs: WINDOW_MS });

    vi.advanceTimersByTime(20_000);
    expect(limiter.check('192.0.2.1')).toEqual({ allowed: false, retryAfterMs: WINDOW_MS - 20_000 });
  });

  it('counts the window from a key’s first request: a refusal does not move it', () => {
    const limiter = new RateLimiter(2, WINDOW_MS);
    expect(limiter.check('k').allowed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(limiter.check('k').allowed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(limiter.check('k')).toEqual({ allowed: false, retryAfterMs: WINDOW_MS - 20_000 });
    vi.advanceTimersByTime(30_000);
    expect(limiter.check('k')).toEqual({ allowed: false, retryAfterMs: WINDOW_MS - 50_000 });
  });

  it('keeps keys apart: one key at its limit leaves another its whole limit', () => {
    const limiter = new RateLimiter(2, WINDOW_MS);
    limiter.check('192.0.2.1:a@example.org');
    limiter.check('192.0.2.1:a@example.org');
    expect(limiter.check('192.0.2.1:a@example.org').allowed).toBe(false);

    expect(limiter.check('192.0.2.1:b@example.org')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('192.0.2.2:a@example.org')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('192.0.2.2:a@example.org')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('192.0.2.2:a@example.org').allowed).toBe(false);
    expect(new RateLimiter(2, WINDOW_MS).check('192.0.2.1:a@example.org').allowed).toBe(true);
  });

  it('allows the key again once its window has passed, for its whole limit in a window of its own', () => {
    const limiter = new RateLimiter(2, WINDOW_MS);
    limiter.check('k');
    limiter.check('k');
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(limiter.check('k')).toEqual({ allowed: false, retryAfterMs: 1 });

    vi.advanceTimersByTime(1);
    expect(limiter.check('k')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('k')).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.check('k')).toEqual({ allowed: false, retryAfterMs: WINDOW_MS });

    vi.advanceTimersByTime(10 * WINDOW_MS);
    expect(limiter.check('k')).toEqual({ allowed: true, retryAfterMs: 0 });
  });
});
