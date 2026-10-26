// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Postgres container the backup and restore scripts run their tools in
// (scripts/lib/pgContainer.ts), named by PG_CONTAINER. Without one the tests
// are skipped, and with CI set they fail.

export type PgContainer = { skipped: false; name: string } | { skipped: true; reason: string };

/** The container to run the scripts against; `describe.skipIf(pg.skipped)` keeps a test from reaching a missing one. */
export function pgContainer(): PgContainer {
  const name = process.env.PG_CONTAINER?.trim();
  if (name) return { skipped: false, name };
  const reason = 'PG_CONTAINER names no Postgres container (set it to the one DATABASE_URL reaches, e.g. owlgraph-postgres)';
  if (process.env.CI) throw new Error(`The operations tests need a container: ${reason}.`);
  return { skipped: true, reason };
}
