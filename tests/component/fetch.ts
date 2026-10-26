// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { vi } from 'vitest';

/** One request a component made: its method, its address and its body, a JSON body parsed and a form's read into an object. */
export type Call = { method: string; url: string; body: unknown };

/** Stands in for `fetch`: every request is kept, and answered by `answer` (404 for the rest). */
export function stubFetch(answer: (call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      const call = { method: init?.method ?? 'GET', url: String(input), body: body instanceof FormData ? Object.fromEntries(body) : typeof body === 'string' ? JSON.parse(body) : null };
      calls.push(call);
      return answer(call) ?? new Response('not found', { status: 404 });
    })
  );
  return calls;
}
