// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A fixed-window counter in memory, one per process: no cross-process
// coordination at a single host's scale. A caller can burst ~2x the limit at a
// window boundary, an accepted tradeoff.
interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {
    // Evicts idle keys; unref() so the timer never blocks shutdown.
    const timer = setInterval(() => this.sweep(), Math.max(windowMs, 60_000));
    timer.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count++;
    return { allowed: true, retryAfterMs: 0 };
  }
}
