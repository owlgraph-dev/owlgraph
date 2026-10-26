// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { baseName, urlFor } from '$tests/support/databases';
import { call, startApp } from '$tests/integration/http';

const app = await startApp();
const fileUrl = process.env.DATABASE_URL!;
const clone = baseName(fileUrl);
const admin = postgres(urlFor(fileUrl, 'postgres'), { max: 1, onnotice: () => {} });

/** Runs `fn` while the file's database refuses every connection, its open sessions ended. */
async function whileUnreachable(fn: () => Promise<void>) {
  await admin.unsafe(`alter database "${clone}" with allow_connections false`);
  try {
    await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${clone} and pid <> pg_backend_pid()`;
    await fn();
  } finally {
    await admin.unsafe(`alter database "${clone}" with allow_connections true`);
  }
}

afterAll(async () => {
  await admin.end({ timeout: 5 });
});

describe.skipIf(app.skipped)('GET /api/health', () => {
  const server = app as Extract<typeof app, { skipped: false }>;
  afterAll(() => server.close());

  it('answers 200 with status ok to a request without a session, after a round trip to the database', async () => {
    const res = await call(server, '/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ status: 'ok' });
    // Not sent to the sign-in, and no session made.
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 503 with status error while the database cannot be reached, and 200 again once it can', async () => {
    await whileUnreachable(async () => {
      const res = await call(server, '/api/health');
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: 'error' });
    });

    const res = await call(server, '/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
