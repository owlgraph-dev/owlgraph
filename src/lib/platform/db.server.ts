// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// For the standalone MCP process; a no-op where the environment has the vars.
import 'dotenv/config';
import postgres from 'postgres';
import { logEvent, logger } from './logger.server';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// The integration tests set a small DB_POOL_MAX: several files run pools at once.
const poolMax = Number.parseInt(process.env.DB_POOL_MAX ?? '', 10);

// Drops one benign notice: a stop-word-only search, which search-as-you-type
// fires per keystroke. Only a notice's structural fields are logged: its detail
// can quote row values (docs/architecture/logging.md, "Never logged"). postgres.js's `debug`
// stays off: it sees the bound parameters.
export const db = postgres(url, {
  max: poolMax > 0 ? poolMax : 10,
  onnotice: (notice) => {
    if (notice.routine === 'cleanup_tsquery_stopwords') return;
    logEvent(logger, 'db.notice', { routine: notice.routine, severity: notice.severity, code: notice.code });
  }
});

// The pool or a begin() transaction: postgres.js types the two as siblings.
export type TxSql = typeof db | postgres.TransactionSql;

// What json() accepts; dynamic payloads are asserted to it at the boundary.
export type JsonArg = Parameters<typeof db.json>[0];

/**
 * Postgres's own error, whose message (a constraint, a table, a refused value)
 * is never for a person: a route lets it through to the error handler, which
 * answers without detail.
 */
export function isDatabaseError(e: unknown): boolean {
  return e instanceof postgres.PostgresError;
}
