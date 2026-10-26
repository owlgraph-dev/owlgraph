// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The seed empties the database, so its name must say it is a test database
// (docs/guides/testing.md, "The test databases"); a role, host or password saying so
// says nothing about what it holds.

/** The database a postgres:// URL names (its path, decoded), or '' for a value that is not such a URL. */
export function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}

/** Whether a URL names a database the e2e run may reset: one whose name contains `test`. */
export function isTestDatabaseUrl(url: string): boolean {
  return /test/i.test(databaseName(url));
}
