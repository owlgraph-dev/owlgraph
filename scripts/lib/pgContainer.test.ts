// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { parseMigrationRows, safeIdentifier } from './pgContainer';

// A name the scripts put into a container command: an identifier's characters,
// and no more than the 63 bytes Postgres keeps, or it reaches another database.

describe('a database name for the backup and restore scripts', () => {
  it('is used as given when it is an identifier of at most 63 bytes', () => {
    for (const name of ['owlgraph', '_scratch', 'owlgraph_test_int_c4242_ab12cd_rt', 'd'.repeat(63)]) {
      expect(safeIdentifier(name)).toBe(name);
    }
  });

  it('is refused when it is anything but an identifier', () => {
    for (const name of ['', '1st', 'two-words', 'owlgraph;echo injected', '"owlgraph"']) {
      expect(() => safeIdentifier(name), name).toThrow(`Refusing to use unsafe-looking identifier: "${name}"`);
    }
  });

  it('is refused when it is longer than 63 bytes, which Postgres would cut short to another name', () => {
    expect(() => safeIdentifier('d'.repeat(64))).toThrow(`Refusing to use identifier longer than 63 bytes, which Postgres would cut short to another name: "${'d'.repeat(64)}" (64 bytes)`);
  });

  // Cut to 63 bytes, a 63-byte database's scratch name is the database itself.
  it('refuses the restore test’s scratch name for a database whose name it would be cut back to, and keeps it where it fits', () => {
    expect(() => safeIdentifier(`${'d'.repeat(63)}_rt`)).toThrow('longer than 63 bytes');
    expect(safeIdentifier(`${'d'.repeat(60)}_rt`)).toBe(`${'d'.repeat(60)}_rt`);
  });
});

describe('a dump’s schema_migrations, as pg_restore prints it', () => {
  const copy = (columns: string, rows: string[]) =>
    ['SET row_security = off;', '', `COPY public.schema_migrations (${columns}) FROM stdin;`, ...rows, '\\.', '', ''].join('\n');

  it('gives each row’s version, file name and checksum, by the block’s column list', () => {
    const printed = copy('version, filename, checksum, applied_at', ['0001\t0001_a.sql\tabc\t2026-09-08 09:36:42+00', '0002\t0002_b.sql\tdef\t2026-09-08 09:36:43+00']);
    expect(parseMigrationRows(printed)).toEqual([
      { version: '0001', filename: '0001_a.sql', checksum: 'abc' },
      { version: '0002', filename: '0002_b.sql', checksum: 'def' },
    ]);
    const reordered = copy('applied_at, checksum, version, filename', ['2026-09-08 09:36:42+00\tabc\t0001\t0001_a.sql']).replace(/\n/g, '\r\n');
    expect(parseMigrationRows(reordered)).toEqual([{ version: '0001', filename: '0001_a.sql', checksum: 'abc' }]);
  });

  it('is no rows when the block is empty or absent', () => {
    expect(parseMigrationRows(copy('version, filename, checksum, applied_at', []))).toEqual([]);
    expect(parseMigrationRows('SET row_security = off;\n')).toEqual([]);
  });
});
