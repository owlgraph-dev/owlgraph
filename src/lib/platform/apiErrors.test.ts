// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { API_ERRORS, apiError, apiErrorBody, apiErrorFrom, pluginError, textError, type ApiErrorCode } from './apiErrors';
import { CodedError } from './codedError';

const CODES = Object.keys(API_ERRORS) as ApiErrorCode[];

describe('the code table', () => {
  it('words every code in both catalogs, one sentence each, ending in a full stop', () => {
    for (const code of CODES) {
      for (const locale of ['en', 'de']) {
        const { message } = apiErrorBody(code, {}, locale).body.error;
        expect(message, `${code} (${locale})`).toMatch(/^\S.*[.!?]$/);
      }
      expect(apiErrorBody(code, {}, 'de').body.error.message, code).not.toBe(apiErrorBody(code, {}, 'en').body.error.message);
    }
  });

  it('names every code in lowercase snake_case, under an error status', () => {
    for (const code of CODES) {
      expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(API_ERRORS[code].status).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('an error body', () => {
  it('is { error: { code, message } }, with only the details its code carries', async () => {
    const res = apiError('lock_lost', { status: { locked: true }, secret: 'never shown' }, { headers: { 'retry-after': '1' } });
    expect(res.status).toBe(423);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('retry-after')).toBe('1');
    expect(await res.json()).toEqual({ error: { code: 'lock_lost', message: expect.any(String), status: { locked: true } } });
  });

  it('words a detail into its sentence without putting it in the body when the code does not carry it', () => {
    expect(apiErrorBody('not_found', { kind: 'page' }, 'en').body).toEqual({ error: { code: 'not_found', message: "This page doesn't exist, or you can't open it." } });
    expect(apiErrorBody('too_large', { limit: 5 }, 'en').body.error).toEqual({ code: 'too_large', message: 'This file is too large: at most 5 MB.', limit: 5 });
  });

  it("answers a model's refusal under its code, and sends anything else on to the 500 path", async () => {
    const res = apiErrorFrom(new CodedError('unknown_blocks_dropped', 'English, for the log', { dropped: [{ key: 'k' }] }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'unknown_blocks_dropped', dropped: [{ key: 'k' }] } });
    const plain = new Error('a database said something');
    expect(() => apiErrorFrom(plain)).toThrow(plain);
    expect(() => apiErrorFrom(new CodedError('a_code_of_no_table', 'x'))).toThrow('x');
  });

  it("is a byte route's sentence as text, and a plugin's own code with its own sentence", async () => {
    const text = textError('not_found');
    expect([text.status, text.headers.get('content-type'), await text.text()]).toEqual([404, 'text/plain; charset=utf-8', apiErrorBody('not_found').body.error.message]);
    const own = pluginError(400, 'other_origin', 'Not this service.');
    expect([own.status, await own.json()]).toEqual([400, { error: { code: 'other_origin', message: 'Not this service.' } }]);
  });
});
