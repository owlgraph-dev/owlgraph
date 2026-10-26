// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site_settings key/value store; each feature owns the keys it uses.
import { db } from './db.server';

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db<{ value: string }[]>`select value from site_settings where key = ${key}`;
  return rows.length ? rows[0].value : null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  if (value == null || value === '') {
    await db`delete from site_settings where key = ${key}`;
    return;
  }
  await db`
    insert into site_settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value`;
}
