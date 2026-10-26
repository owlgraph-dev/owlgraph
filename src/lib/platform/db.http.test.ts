// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { baseName, urlFor } from '$tests/support/databases';
import { call, startApp } from '$tests/integration/http';

// adapter-node emits `sveltekit:shutdown` once a signal has closed its server,
// and the app ends its pool there. The event is emitted directly: a signal
// would end the test run.

const app = await startApp();
const fileUrl = process.env.DATABASE_URL!;
const clone = baseName(fileUrl);
const admin = postgres(urlFor(fileUrl, 'postgres'), { max: 1, onnotice: () => {} });

async function connectionsToClone(): Promise<number> {
  const [{ n }] = await admin<{ n: number }[]>`select count(*)::int as n from pg_stat_activity where datname = ${clone}`;
  return n;
}

afterAll(async () => {
  await admin.end({ timeout: 5 });
});

describe.skipIf(app.skipped)('the database pool at shutdown', () => {
  const server = app as Extract<typeof app, { skipped: false }>;
  afterAll(() => server.close());

  it('is ended once adapter-node has closed the server: the app keeps no connection to the database open', async () => {
    expect((await call(server, '/api/health')).status).toBe(200);
    expect(await connectionsToClone()).toBeGreaterThan(0);

    // Node's types know no custom process event.
    (process as NodeJS.EventEmitter).emit('sveltekit:shutdown', 'SIGTERM');

    await expect.poll(connectionsToClone, { timeout: 10_000 }).toBe(0);
  });
});
