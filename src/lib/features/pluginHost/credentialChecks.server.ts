// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Failed checks of a credential a person supplies (a share's password) cost
// that person, never the address every reader shares (docs/architecture/plugins.md, "Routes"):
// after a few, nothing more of theirs reaches the service, so nobody guesses
// through owlgraph and the service never throttles owlgraph for one person.

/** Failed checks a person may make in a window… */
const CREDENTIAL_FAILURES = 10;
/** …of this long. */
const CREDENTIAL_WINDOW_MS = 10 * 60_000;

interface Spent {
  count: number;
  resetAt: number;
}

export class CredentialChecks {
  private spent = new Map<string, Spent>();

  constructor(
    private readonly failures = CREDENTIAL_FAILURES,
    private readonly windowMs = CREDENTIAL_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  allowed(key: string): { allowed: boolean; retryAfterMs: number } {
    const spent = this.spent.get(key);
    if (!spent || this.now() >= spent.resetAt) return { allowed: true, retryAfterMs: 0 };
    return spent.count < this.failures ? { allowed: true, retryAfterMs: 0 } : { allowed: false, retryAfterMs: spent.resetAt - this.now() };
  }

  failed(key: string): void {
    const now = this.now();
    const spent = this.spent.get(key);
    if (!spent || now >= spent.resetAt) this.spent.set(key, { count: 1, resetAt: now + this.windowMs });
    else spent.count++;
    if (this.spent.size > 10_000) {
      for (const [k, s] of this.spent) if (now >= s.resetAt) this.spent.delete(k);
    }
  }
}

/** The process's one budget, shared by every route that checks a supplied credential. */
export const credentialChecks = new CredentialChecks();
