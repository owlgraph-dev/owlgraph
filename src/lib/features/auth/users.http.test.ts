// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf } from '$tests/integration/users';

const app = await startApp();

describe.skipIf(app.skipped)('an admin managing their own account', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const stateOf = async (id: string) => (await db<{ role: string; is_active: boolean }[]>`select role, is_active from users where id = ${id}`)[0];

  it('saving their own role as anything but admin is refused, and they stay admin', async () => {
    const admin = await userOf('admin');
    const res = await formAction(served, '/settings/users?/update', { id: admin.id, role: 'viewer', password: '' }, { as: 'admin' });
    expect(res.type).toBe('failure');
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error: { code: 'own_admin_role', message: "You can't remove your own admin role." } });
    expect(await stateOf(admin.id)).toEqual({ role: 'admin', is_active: true });
  });

  it('deactivating their own account is refused, and it stays active', async () => {
    const admin = await userOf('admin');
    const res = await formAction(served, '/settings/users?/setActive', { id: admin.id, active: 'false' }, { as: 'admin' });
    expect(res.type).toBe('failure');
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error: { code: 'own_deactivate', message: "You can't deactivate your own account." } });
    expect(await stateOf(admin.id)).toEqual({ role: 'admin', is_active: true });
  });
});
