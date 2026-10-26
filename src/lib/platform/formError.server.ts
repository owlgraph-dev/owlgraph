// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A form action's refusal (docs/architecture/routing.md, "Errors"): the API's one error
// body, from the same table, as the action's failure, so a settings page shows
// a model's refusal in the interface's language. Anything that is no refusal
// goes on to the 500 path: a database's message never reaches a page.
import { fail } from '@sveltejs/kit';
import { apiErrorBody, isApiErrorCode, type ApiErrorBody, type ApiErrorCode } from './apiErrors';
import { isCodedError } from './codedError';

/**
 * `fail(status, { error: { code, message, … } })` for a code of the table or a
 * model's CodedError under one; `extra` sits beside `error` (a compiler's
 * issues, the values to fill the form with again).
 */
export function formError<Extra extends Record<string, unknown> = Record<never, never>>(refusal: unknown, details: Record<string, unknown> = {}, extra: Extra = {} as Extra) {
  const coded = isCodedError(refusal) && isApiErrorCode(refusal.code) ? refusal : null;
  const code: ApiErrorCode | null = coded ? (coded.code as ApiErrorCode) : typeof refusal === 'string' && isApiErrorCode(refusal) ? refusal : null;
  if (!code) throw refusal;
  const { status, body } = apiErrorBody(code, { ...(coded?.details ?? {}), ...details });
  return fail(status, { ...extra, ...body } as Extra & ApiErrorBody);
}
