// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every database of the run, for a setup that must reach every worker's, such
// as the branded lane's accent.
import postgres from 'postgres';

export async function eachRunDatabase(change: (sql: postgres.Sql) => Promise<unknown>): Promise<void> {
  const workers = JSON.parse(process.env.E2E_WORKER_DATABASES ?? '[]') as string[];
  const urls = workers.length > 0 ? workers : [process.env.DATABASE_URL!];
  for (const url of urls) {
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await change(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
