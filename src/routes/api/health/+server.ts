// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { json } from '@sveltejs/kit';
import { db } from '$lib/platform/db.server';
import { logEvent, errorClass } from '$lib/platform/logger.server';

// Public (src/lib/shell/publicRoutes.ts), for the container healthcheck; a
// database round trip, so it says "can serve requests", not "process is up".
export async function GET({ locals }) {
  try {
    await db`select 1`;
    return json({ status: 'ok' });
  } catch (err) {
    logEvent(locals.log, 'error.unhandled', {
      errorClass: errorClass(err),
      message: 'Health check DB round-trip failed',
      stack: err instanceof Error ? err.stack : undefined,
    });
    return json({ status: 'error' }, { status: 503 });
  }
}
