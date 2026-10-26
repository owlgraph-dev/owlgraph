// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The browser's side of the API's errors (docs/architecture/routing.md, "Errors"): the one
// body, `{ error: { code, message, …details } }`, read once. A client branches
// on the code and shows the message, which is already in the interface's
// language.
import * as m from '$lib/paraglide/messages';

export interface ApiErrorReply {
  code: string;
  message: string;
  [detail: string]: unknown;
}

/**
 * The error a failed response answered with. One without the API's body — a
 * proxy's page, a network failure (`null`) — is `unknown` or `network`, with
 * the generic sentence.
 */
export async function readApiError(res: Response | null): Promise<ApiErrorReply> {
  const body: unknown = res ? await res.clone().json().catch(() => null) : null;
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  if (error && typeof error === 'object') {
    const reply = error as Partial<ApiErrorReply>;
    if (typeof reply.code === 'string' && typeof reply.message === 'string') return reply as ApiErrorReply;
  }
  return { code: res ? 'unknown' : 'network', message: m.error_generic() };
}

/** The sentence to show for a failed response: an unexpected error's names the id the log has it under. */
export async function apiErrorText(res: Response | null): Promise<string> {
  const reply = await readApiError(res);
  return reply.code === 'internal' && typeof reply.id === 'string' ? `${reply.message} (${reply.id})` : reply.message;
}
