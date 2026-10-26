// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { getLocale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';
import { withContentLocale } from './contentLocale.server';

describe('withContentLocale() — rendering in the content language', () => {
  it('speaks the given language inside, and the outer one again after', async () => {
    const outside = getLocale();
    const inside = await withContentLocale('de', async () => {
      await Promise.resolve(); // across an await, as a render with queries is
      return { locale: getLocale(), word: m.locale_name_en() };
    });
    expect(inside).toEqual({ locale: 'de', word: 'Englisch' });
    expect(getLocale()).toBe(outside);
  });

  it('nests: the innermost language wins', async () => {
    const result = await withContentLocale('de', () => withContentLocale('en', () => getLocale()));
    expect(result).toBe('en');
  });

  it('ignores a code that is not a catalog', async () => {
    expect(await withContentLocale('fr', () => getLocale())).toBe(getLocale());
  });
});
