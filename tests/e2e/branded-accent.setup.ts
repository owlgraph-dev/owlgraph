// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test as setup } from '@playwright/test';
import { eachRunDatabase } from './runDatabases';

// A yellow accent no scheme can use as it is, so both schemes' accents are
// generated from it; on every worker's database, since any may run the lane.
export const BRANDED_ACCENT = '#ffd400';

setup('seed an extreme brand accent', async () => {
  await eachRunDatabase(async (sql) => {
    await sql`delete from themes where scope_kind = 'site'`;
    await sql`insert into themes (scope_kind, tokens) values ('site', ${sql.json({ version: 1, accent: BRANDED_ACCENT })})`;
  });
});
