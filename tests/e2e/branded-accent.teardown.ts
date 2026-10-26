// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test as teardown } from '@playwright/test';
import { eachRunDatabase } from './runDatabases';

teardown('remove the seeded brand accent', async () => {
  await eachRunDatabase((sql) => sql`delete from themes where scope_kind = 'site'`);
});
