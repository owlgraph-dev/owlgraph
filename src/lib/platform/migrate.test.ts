// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { splitStatements } from './migrate.server';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', '..', 'migrations');

describe('a migration file split into statements', () => {
  it('is cut at each top-level semicolon, each statement trimmed, empty ones dropped and a last one without its semicolon kept', () => {
    expect(splitStatements('create table a (x int);\n\n  insert into a values (1) ;;\n select 1\n')).toEqual([
      'create table a (x int)',
      'insert into a values (1)',
      'select 1',
    ]);
  });

  it('keeps a $$ body whole, the semicolons inside it included', () => {
    const body = "do $$\nbegin\n  if not exists (select 1 from pg_roles where rolname = 'r') then\n    create role r;\n  end if;\nend\n$$";
    expect(splitStatements(`${body};\ngrant usage on schema public to r;`)).toEqual([body, 'grant usage on schema public to r']);
  });

  it('keeps a $tag$ body whole, a $$ inside it included, and ends it only at its own tag', () => {
    const fn =
      'create function f() returns void language plpgsql as $body$\nbegin\n  execute $$select 1; select 2$$;\n  perform 1;\nend\n$body$';
    expect(splitStatements(`${fn};\nselect f();`)).toEqual([fn, 'select f()']);
  });

  it('is not cut at a semicolon in a line comment', () => {
    const statements = splitStatements('create table a (x int); -- one; two\n-- three;\nselect 1;');
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe('create table a (x int)');
    expect(statements[1]).toMatch(/select 1$/);
    expect(statements.join('\n')).not.toMatch(/two|three/);
  });

  it('comes out of every shipped migration as statements whose dollar-quoted bodies are whole', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const statements = splitStatements(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
      expect(statements.length, file).toBeGreaterThan(0);
      for (const statement of statements) {
        // A cut inside a body leaves a tag without its partner.
        const tags = new Map<string, number>();
        for (const [tag] of statement.matchAll(/\$[A-Za-z_]*\$/g)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
        for (const [tag, count] of tags) expect(count % 2, `${file}: ${tag} in ${statement.slice(0, 60)}`).toBe(0);
      }
    }
  });

  it('is not cut at a semicolon in a block comment', () => {
    const statements = splitStatements('/* one; two */ select 1;\nselect 2;');
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/select 1$/);
    expect(statements[1]).toBe('select 2');
  });

  it('is not cut at a semicolon inside a quoted string, which is not top-level', () => {
    const insert = "insert into styles (css) values ('a { color: red; }')";
    expect(splitStatements(`${insert};\nselect 2;`)).toEqual([insert, 'select 2']);
  });

  it('keeps a -- inside a quoted string, which starts no comment', () => {
    const insert = "insert into styles (css) values ('color: var(--ds-color-fg)')";
    expect(splitStatements(`${insert};\nselect 2;`)).toEqual([insert, 'select 2']);
  });

  it('knows an escaped quote, a quoted identifier, a nested block comment and a parameter for what they are', () => {
    const statements = splitStatements(
      "insert into t (a) values (E'it\\'s; fine'), ('it''s; fine');\n" +
        'alter table "odd; name" add column b int;\n' +
        '/* outer /* inner; */ still; a comment */ prepare q as select $1;\n'
    );
    expect(statements).toEqual([
      "insert into t (a) values (E'it\\'s; fine'), ('it''s; fine')",
      'alter table "odd; name" add column b int',
      'prepare q as select $1',
    ]);
  });

  it('keeps a body whole whose tag has a digit in it', () => {
    const fn = 'create function f() returns int language plpgsql as $fn1$\nbegin\n  perform 1;\n  return 1;\nend\n$fn1$';
    expect(splitStatements(`${fn};\nselect f();`)).toEqual([fn, 'select f()']);
  });

  it('is refused when a block comment is left open, naming the file and the line it opens on — one that only looks closed too, as comments nest', () => {
    const source = 'migration 0052_notes.sql';
    expect(() => splitStatements('create table a (x int);\n/* lists docs/*.md */\ncreate table b (x int);\n', source)).toThrow(
      'The /* comment opened on line 2 of migration 0052_notes.sql is never closed'
    );
    expect(() => splitStatements('create table a (x int);\n\n/* one; two\ncreate table b (x int);\n', source)).toThrow(
      'The /* comment opened on line 3 of migration 0052_notes.sql is never closed'
    );
  });

  it.each([
    { open: "a quoted string whose last quote is an escaped one ('')", what: 'quoted string', rest: "insert into t (a) values ('it''s);\nselect 2;\n" },
    { open: "an E'…' string whose last quote is backslash-escaped", what: 'quoted string', rest: "insert into t (a) values (E'ends in a backslash\\');\nselect 2;\n" },
    { open: 'a quoted identifier', what: 'quoted identifier', rest: 'alter table "odd; name add column b int;\nselect 2;\n' },
    { open: 'a $$ body', what: '$$ body', rest: 'do $$\nbegin\n  perform 1;\nend;\nselect 2;\n' },
    { open: 'a $tag$ body followed only by another tag', what: '$fn$ body', rest: 'create function f() returns void language plpgsql as $fn$\nbegin\n  perform 1;\nend\n$$;\nselect 2;\n' },
  ])('is refused when $open is left open, as when a comment is', ({ what, rest }) => {
    expect(() => splitStatements(`select 1;\n${rest}`, 'migration 0052_notes.sql')).toThrow(`The ${what} opened on line 2 of migration 0052_notes.sql is never closed.`);
  });
});
