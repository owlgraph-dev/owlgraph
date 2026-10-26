// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { databaseName, isTestDatabaseUrl } from './testDb';

describe('the e2e run resets only a database named as a test database', () => {
  it('accepts a database whose name contains test', () => {
    expect(isTestDatabaseUrl('postgres://user:password@localhost:5432/owlgraph_test')).toBe(true);
    expect(isTestDatabaseUrl('postgres://ci@db:5432/test')).toBe(true);
  });

  it('refuses a real database whose role, host or password merely contains test', () => {
    expect(isTestDatabaseUrl('postgres://tester:secret@localhost:5432/owlgraph')).toBe(false);
    expect(isTestDatabaseUrl('postgres://user:testpass@test-host:5432/production')).toBe(false);
    expect(isTestDatabaseUrl('postgres://user:password@localhost:5432/owlgraph?application_name=test')).toBe(false);
  });

  it('refuses what is not a database URL at all', () => {
    expect(isTestDatabaseUrl('')).toBe(false);
    expect(isTestDatabaseUrl('owlgraph_test')).toBe(false);
  });

  it('reads the name decoded', () => {
    expect(databaseName('postgres://u@h/my%20test%20db')).toBe('my test db');
  });
});
