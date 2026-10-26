// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A full pg_dump of the database, one consistent snapshot with no downtime
// (docs/guides/backup.md). The images' stored copies are left out: they are made
// again on demand (docs/architecture/media.md).
//   npm run db:backup -- --out=<path> [--container=<name>] [--db=<name>] [--force]
import { existsSync, createWriteStream, statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execInPostgres, pgTargetDescription, safeIdentifier } from './lib/pgContainer';

const outArg = process.argv.find((a) => a.startsWith('--out='));
if (!outArg) {
  throw new Error(
    'Usage: npm run db:backup -- --out=<path> [--container=<name>] [--db=<name>] [--force]\n' +
      'Writes a full pg_dump (-Fc) of the compose Postgres (or the container named by\n' +
      '--container=/PG_CONTAINER) to <path> — its own database, or the one --db names.'
  );
}
const out = outArg.slice('--out='.length);
const force = process.argv.includes('--force');
const dbArg = process.argv.find((a) => a.startsWith('--db='));
// The container's own database unless one is named (the backup test names its own).
const dbFlag = dbArg ? safeIdentifier(dbArg.slice('--db='.length)) : '"$POSTGRES_DB"';

if (existsSync(out) && !force) {
  throw new Error(`"${out}" already exists. Pass --force to overwrite.`);
}

mkdirSync(dirname(out), { recursive: true });
const dest = createWriteStream(out);
await execInPostgres(`pg_dump -U "$POSTGRES_USER" -d ${dbFlag} -Fc --exclude-table-data=asset_variants`, { stdout: dest });

const { size } = statSync(out);
console.log(`Backup written to ${out} (${size.toLocaleString()} bytes) from ${pgTargetDescription()}.`);
