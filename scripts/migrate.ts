// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Creates the database if needed and applies the pending migrations (docs/architecture/migrations.md).
//   npm run db:migrate
//   npm run db:migrate -- --mark-applied=0001   (records a migration without running it, for a schema made by other means)
import { ensureDatabase } from '../src/lib/platform/dbSetup.server';
import { runMigrations, markApplied } from '../src/lib/platform/migrate.server';
import { MigrationRefused, adoptedMessage } from '../src/lib/platform/baseline.server';
import { db } from '../src/lib/platform/db.server';
import { markProcess } from '../src/lib/platform/logger.server';
import { urlPassword, weakSecretReason } from '../src/lib/platform/secrets';
import { secretKeyProblem } from '../src/lib/platform/secretBox.server';

markProcess('migrate');

// Unfit secrets fail here, in production: compose starts app and mcp only after
// migrate succeeds, so the stack never comes up crash-looping far from the cause.
if (process.env.NODE_ENV === 'production') {
  const problems = [
    ['APP_DB_PASSWORD', weakSecretReason(process.env.APP_DB_PASSWORD)],
    ["The Postgres superuser password (POSTGRES_PASSWORD, in migrate's DATABASE_URL)", weakSecretReason(urlPassword(process.env.DATABASE_URL))],
    // Optional, but one that is set must be fit (docs/architecture/authorization.md, "Secrets").
    ['APP_SECRET_KEY', process.env.APP_SECRET_KEY ? secretKeyProblem(process.env.APP_SECRET_KEY) : null],
    // Test tooling (platform/upstream.server.ts): plain http to loopback.
    ['INTEGRATIONS_ALLOW_HTTP_LOOPBACK', process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK ? 'is test tooling and must not be set' : null],
  ].filter(([, reason]) => reason);
  if (problems.length) {
    for (const [name, reason] of problems) console.error(`${name} ${reason}.`);
    console.error('Refusing to migrate in production — set strong values in .env (see docs/guides/deployment.md).');
    process.exit(1);
  }
}

await ensureDatabase(process.env.DATABASE_URL!);

// A refusal (docs/architecture/migrations.md, "The baseline") is one readable line, not a
// stack trace: in compose, what `docker compose logs migrate` shows.
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof MigrationRefused)) throw err;
    console.error(err.message);
    await db.end();
    process.exit(1);
  }
}

const markArg = process.argv.find((a) => a.startsWith('--mark-applied='));
if (markArg) {
  const version = markArg.slice('--mark-applied='.length);
  await refusing(() => markApplied(db, version));
  console.log(`Marked migration ${version} as applied (not executed).`);
} else {
  const { applied, adopted } = await refusing(() => runMigrations(db));
  if (adopted) console.log(adoptedMessage(adopted));
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Already up to date.');
}

// The app_user role's password (migrations/0001_baseline.sql) comes from env,
// not a checksummed file, so it is set on every run: a rotated APP_DB_PASSWORD
// takes effect on the next `db:migrate`.
const appDbPassword = process.env.APP_DB_PASSWORD;
if (appDbPassword) {
  // ALTER ROLE takes no bind parameter for the password. Doubling quotes is
  // enough with standard_conforming_strings on, and the value is the operator's.
  const escaped = appDbPassword.replace(/'/g, "''");
  await db.unsafe(`alter role app_user with password '${escaped}'`);
  console.log('app_user password set/rotated from APP_DB_PASSWORD.');
} else {
  console.warn('APP_DB_PASSWORD not set — app_user password left unchanged (it may still have none, i.e. unable to log in).');
}

await db.end();
process.exit(0);
