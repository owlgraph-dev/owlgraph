// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Creates the target database when missing, for scripts/migrate.ts and the e2e
// global setup.
import postgres from 'postgres';

// Postgres cuts a name to 63 bytes: a longer one would be created under the cut
// name, and the next run's existence check would miss it.
const MAX_NAME_BYTES = 63;

export function safeDbName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to use unsafe-looking database name: "${name}"`);
  }
  if (name.length > MAX_NAME_BYTES) {
    throw new Error(`Refusing to use a database name longer than ${MAX_NAME_BYTES} bytes, which Postgres would cut short: "${name}" (${name.length} bytes)`);
  }
  return name;
}

export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const target = new URL(databaseUrl);
  const dbName = safeDbName(target.pathname.slice(1));
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres'; // maintenance database, always present
  const admin = postgres(adminUrl.toString());
  try {
    const rows = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) await admin.unsafe(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }
}
