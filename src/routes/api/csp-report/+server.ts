// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// CSP violation reports (src/lib/platform/csp.ts), one log line each, nothing
// stored. Browsers send them without a session, so the endpoint is bounded
// per IP and per body size, and an unreadable body is logged by its reason and
// size, never its content, which would make the log the injection surface.
// Every URL passes through safeUrl, or a /share/<token> page would write its
// token into the log (docs/architecture/logging.md, "URLs in logs").
import type { RequestHandler } from './$types';
import { RateLimiter } from '$lib/platform/rateLimit';
import { summarizeCspReport } from '$lib/platform/csp';
import { logEvent } from '$lib/platform/logger.server';

const limiter = new RateLimiter(30, 60_000);
const MAX_BODY_BYTES = 16 * 1024;

export const POST: RequestHandler = async ({ request, getClientAddress, url, locals }) => {
  if (!limiter.check(getClientAddress()).allowed) return new Response(null, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown = null;
  let malformed = false;
  try {
    body = JSON.parse(text);
  } catch {
    // Acknowledged all the same: a browser can do nothing with an error here.
    malformed = true;
  }
  // So the app's own absolute URLs keep their route pattern.
  const violations = summarizeCspReport(body, { origin: url.origin });
  for (const violation of violations) logEvent(locals.log, 'csp.violation', violation);
  if (violations.length === 0) {
    logEvent(locals.log, 'csp.report_unreadable', {
      reason: malformed ? 'invalid-json' : 'not-a-report',
      bytes: text.length,
    });
  }
  return new Response(null, { status: 204 });
};
