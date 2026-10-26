// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { assertDisposable, baseName, fileCloneName, templateName, urlFor, workerName } from './databases';

const URL_ = 'postgres://user:password@localhost:5432/owlgraph_test';

describe('a test run derives every database it owns from its own test database', () => {
  it('takes the base from DATABASE_URL and refuses one that is not a test database', () => {
    expect(baseName(URL_)).toBe('owlgraph_test');
    expect(() => baseName('postgres://user:password@localhost:5432/owlgraph')).toThrow(/test database/);
  });

  it('names templates, worker databases and per-file clones after the base', () => {
    expect(templateName('owlgraph_test', 'int')).toBe('owlgraph_test_int_tpl');
    expect(templateName('owlgraph_test', 'e2e')).toBe('owlgraph_test_e2e_tpl');
    expect(workerName('owlgraph_test', 3)).toBe('owlgraph_test_e2e_w3');
    expect(fileCloneName('owlgraph_test')).toMatch(/^owlgraph_test_int_c\d+_[a-z0-9]+$/);
  });

  it('creates or drops only those names, and a file clone’s own databases', () => {
    const clone = fileCloneName('owlgraph_test');
    for (const name of ['owlgraph_test_int_tpl', 'owlgraph_test_e2e_w0', clone, `${clone}_rt`, `${clone}_m1`]) {
      expect(() => assertDisposable('owlgraph_test', name), name).not.toThrow();
    }
    for (const name of ['owlgraph_test', 'owlgraph', 'owlgraph_test_e2e_w', 'other_test_e2e_w0', 'owlgraph_test_e2e_w0; drop database x', 'owlgraph_test_int_tpl_rt', `${clone}_`]) {
      expect(() => assertDisposable('owlgraph_test', name), name).toThrow(/Refusing/);
    }
  });

  it('points a URL at another database on the same server, keeping its credentials', () => {
    expect(urlFor(URL_, 'owlgraph_test_e2e_w1')).toBe('postgres://user:password@localhost:5432/owlgraph_test_e2e_w1');
  });
});
