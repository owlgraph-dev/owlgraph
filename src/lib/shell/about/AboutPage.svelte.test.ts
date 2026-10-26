// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import AboutPage from './AboutPage.svelte';
import type { InstallationInfo } from './types';

// The schema row in the database states the server reads (migrate.server.ts,
// migrationStatus); about.http.test.ts serves a migrated one.

const INSTALLATION: InstallationInfo = {
  version: '0.1.0',
  revision: 'dev',
  node: 'v22.15.0',
  postgres: '16.14',
  origin: 'https://example.org',
  schema: { applied: 1, latest: '0001_baseline.sql', pending: [], adopts: null, refused: null },
  languages: { enabled: ['en'], defaultLocale: 'en' },
  integrations: [],
  secretKey: 'set',
};

function renderSchema(schema: InstallationInfo['schema']) {
  render(AboutPage, {
    data: { version: '0.1.0', revision: null, sourceHref: '/-/source', installation: { ...INSTALLATION, schema }, footer: { branding: null } },
  });
  return screen.getByRole('group', { name: 'Database schema' });
}

describe('the About page’s database schema', () => {
  it('says what the next migrate adopts in place of the migrations a baseline replaces', async () => {
    const row = renderSchema({
      applied: 59,
      latest: '0059_node_versions_node.sql',
      pending: ['0001_baseline.sql'],
      adopts: { baseline: '0001_baseline.sql', replaced: 59 },
      refused: null,
    });
    await expect.element(row).toHaveTextContent('Migrations applied: 59, the latest 0059_node_versions_node.sql');
    await expect.element(row).toHaveTextContent('Behind this version');
    await expect.element(row).toHaveTextContent('Not applied yet: 0001_baseline.sql');
    await expect.element(row).toHaveTextContent('The next migrate records 0001_baseline.sql in place of 59 migrations, without running it');
  });

  it('says that migrate refuses a database from before the baseline, and through which release it upgrades', async () => {
    const row = renderSchema({
      applied: 41,
      latest: '0041_localized_schema_labels.sql',
      pending: [],
      adopts: null,
      refused: { cause: 'partial', baseline: '0001_baseline.sql', tag: 'pre-baseline' },
    });
    await expect.element(row).toHaveTextContent('Cannot be migrated');
    await expect.element(row).toHaveTextContent(
      'Migrate refuses this database: it has applied only some of the migrations 0001_baseline.sql replaces. Upgrade through the release tagged pre-baseline first.'
    );
    await expect.element(row).not.toHaveTextContent('Nothing waiting to be applied');
  });

  it('says that migrate refuses one whose records are not what the baseline replaces', async () => {
    const row = renderSchema({ applied: 3, latest: '0003_c.sql', pending: [], adopts: null, refused: { cause: 'mismatch', baseline: '0001_baseline.sql', tag: 'pre-baseline' } });
    await expect.element(row).toHaveTextContent('Cannot be migrated');
    await expect.element(row).toHaveTextContent('what it records is not the migrations 0001_baseline.sql replaces');
  });

  it('says nothing waits on a database that is current', async () => {
    const row = renderSchema(INSTALLATION.schema);
    await expect.element(row).toHaveTextContent('Migrations applied: 1, the latest 0001_baseline.sql');
    await expect.element(row).toHaveTextContent('Nothing waiting to be applied');
    await expect.element(row).not.toHaveTextContent('Behind this version');
  });
});
