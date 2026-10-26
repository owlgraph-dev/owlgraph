// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { readFormData } from './formData';

function streamingRequest(error: unknown): Request {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('--x\r\n'));
      controller.error(error);
    },
  });
  return new Request('http://localhost/', {
    method: 'POST',
    body,
    // @ts-expect-error — required by Node for a streamed request body, missing from the DOM RequestInit type
    duplex: 'half',
    headers: { 'content-type': 'multipart/form-data; boundary=x' },
  });
}

describe('readFormData', () => {
  it('returns the parsed form', async () => {
    const fd = new FormData();
    fd.append('title', 'Bericht');
    const form = await readFormData(new Request('http://localhost/', { method: 'POST', body: fd }));
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('title')).toBe('Bericht');
  });

  it("reports adapter-node's body-limit abort as too-large", async () => {
    const limit = Object.assign(new Error('Content-length exceeds limit'), { status: 413 });
    expect(await readFormData(streamingRequest(limit))).toBe('too-large');
  });

  it('returns null for any other parse failure', async () => {
    expect(await readFormData(streamingRequest(new Error('socket hang up')))).toBeNull();
    expect(await readFormData(new Request('http://localhost/', { method: 'POST', body: 'not a form' }))).toBeNull();
  });
});
