// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Regenerates schema.sql, a snapshot of a migrated database that is never
// applied (docs/architecture/migrations.md). pg_dump runs in the Postgres container, so
// its version matches the server's.
//   npm run db:dump-schema -- --container=<docker-container-name>
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, '..', 'schema.sql');

const containerArg = process.argv.find((a) => a.startsWith('--container='));
if (!containerArg) {
  throw new Error(
    'Usage: npm run db:dump-schema -- --container=<docker-container-name>\n' +
      'Pass the name of a running Postgres container to exec pg_dump inside (e.g. --container=owlgraph-postgres).'
  );
}
const container = containerArg.slice('--container='.length);

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');

const dump = execFileSync(
  'docker',
  [
    'exec', container, 'pg_dump', url,
    '--schema-only', '--no-owner', '--no-privileges',
    '--exclude-table=schema_migrations'
  ],
  { encoding: 'utf8' }
);

// The licence header, as on every source file (scripts/license-headers.mjs).
const header = `-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- GENERATED FILE — do not hand-edit. Documentation-only snapshot of the
-- live schema, produced by:
--   npm run db:dump-schema -- --container=<name>
-- Not applied to any database — migrations/ is the only thing that builds or
-- updates one. Regenerate after every migration. See docs/architecture/migrations.md.

`;

// pg_dump's `\restrict <key>` brackets carry a fresh random key each run, which
// a snapshot nobody restores doesn't need and a secret scanner flags.
const snapshot = dump.replace(/^\\(?:un)?restrict \S+\r?\n/gm, '');

writeFileSync(schemaPath, header + snapshot);
console.log(`schema.sql regenerated via container "${container}".`);
