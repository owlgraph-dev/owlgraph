// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { baseName, createEmptyDatabase, dropDatabase, sweep, templateName, urlFor } from './databases';

// On databases under a base name of this file's own, beside the run's, never
// inside it. A clone with a session open stands for a run in progress elsewhere.

const fileUrl = process.env.DATABASE_URL!;
// The run's base, from this file's clone (`<base>_int_c<pid>_<id>`).
const runBase = baseName(fileUrl).replace(/_int_c\d+_[a-z0-9]+$/, '');
const base = `${runBase}_sweepcheck`;
const otherBase = `${runBase}_sweepother`;
const baseUrl = urlFor(fileUrl, base);
const otherUrl = urlFor(fileUrl, otherBase);
const clonePrefix = `${base}_int_c`;

const leftover = `${base}_int_c1_left`;
/** A database of the leftover clone's own (`<clone>_<suffix>`), as a restore test or a migration test makes one. */
const leftoversOwn = `${leftover}_rt`;
const held = `${base}_int_c2_held`;
const template = templateName(base, 'int');
const othersClone = `${otherBase}_int_c1_kept`;

const admin = postgres(urlFor(fileUrl, 'postgres'), { max: 1, onnotice: () => {} });
let holder: postgres.Sql | null = null;

const exists = async (name: string) => (await admin`select 1 from pg_database where datname = ${name}`).length > 0;
const sessionsOn = async (name: string) => Number((await admin`select count(*) from pg_stat_activity where datname = ${name}`)[0].count);

afterAll(async () => {
  await holder?.end({ timeout: 5 });
  for (const name of [leftover, leftoversOwn, held, template]) await dropDatabase(baseUrl, name);
  await dropDatabase(otherUrl, othersClone);
  await admin.end({ timeout: 5 });
});

describe('a run’s sweep', () => {
  // Five databases made while the run's other files make theirs: more than the default time, on a busy server.
  it('drops only this base’s leftover clones no session is connected to: a clone in use, the template and another base’s clones stay', { timeout: 120_000 }, async () => {
    for (const name of [leftover, leftoversOwn, held, template]) await createEmptyDatabase(baseUrl, name);
    await createEmptyDatabase(otherUrl, othersClone);
    // A run in progress elsewhere: a session open on its clone.
    holder = postgres(urlFor(fileUrl, held), { max: 1, onnotice: () => {} });
    await holder`select 1`;
    expect(await sessionsOn(held)).toBe(1);

    expect((await sweep(baseUrl, [clonePrefix])).sort()).toEqual([leftover, leftoversOwn].sort());

    for (const name of [leftover, leftoversOwn]) expect(await exists(name), name).toBe(false);
    for (const name of [held, template, othersClone]) expect(await exists(name), name).toBe(true);
  });

  it('drops the clone that was in use once its session has ended — at the next sweep, not before', async () => {
    expect(await exists(held)).toBe(true);
    await holder!.end({ timeout: 5 });
    holder = null;
    // The server ends the session's backend a moment after the client hangs up.
    for (let tries = 0; (await sessionsOn(held)) > 0 && tries < 50; tries++) await new Promise((r) => setTimeout(r, 100));
    expect(await sessionsOn(held)).toBe(0);

    expect(await sweep(baseUrl, [clonePrefix])).toEqual([held]);
    expect(await exists(held)).toBe(false);
    for (const name of [template, othersClone]) expect(await exists(name), name).toBe(true);
  });
});
