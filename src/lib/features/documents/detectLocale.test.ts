// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { detectLocale } from './detectLocale';

const ENGLISH =
  'The study examines how the distribution of resources in urban areas has changed over the last decade. ' +
  'It shows that the effects were stronger in regions with a high share of rental housing, and that the ' +
  'measures which were introduced by the city have not been able to reverse the trend. We argue that this is ' +
  'a result of the way in which the programmes were designed, and we propose a number of changes that could ' +
  'improve their impact on the people who are most affected by them.';

const GERMAN =
  'Die Studie untersucht, wie sich die Verteilung der Ressourcen in städtischen Gebieten in den letzten zehn ' +
  'Jahren verändert hat. Sie zeigt, dass die Effekte in Regionen mit einem hohen Anteil an Mietwohnungen ' +
  'stärker waren und dass die Maßnahmen, die von der Stadt eingeführt wurden, den Trend nicht umkehren ' +
  'konnten. Wir argumentieren, dass dies eine Folge der Art ist, wie die Programme gestaltet wurden, und ' +
  'schlagen eine Reihe von Änderungen vor, die ihre Wirkung auf die Menschen verbessern können.';

describe('detectLocale() — a suggestion, never a certainty', () => {
  it('recognizes running English and German text', () => {
    expect(detectLocale(ENGLISH, ['de', 'en'])).toBe('en');
    expect(detectLocale(GERMAN, ['de', 'en'])).toBe('de');
  });

  it('suggests nothing for a short text', () => {
    expect(detectLocale('Annual report 2025', ['de', 'en'])).toBeNull();
  });

  it('suggests nothing for a text mixed half and half', () => {
    expect(detectLocale(`${ENGLISH} ${GERMAN}`, ['de', 'en'])).toBeNull();
  });

  it('only ever suggests a candidate (an enabled language)', () => {
    expect(detectLocale(GERMAN, ['en'])).toBeNull();
    expect(detectLocale(ENGLISH, ['en'])).toBe('en');
  });

  it('suggests nothing for text without words (a table of numbers)', () => {
    expect(detectLocale('1 2 3 4 5 6 7 8 9 10 '.repeat(20), ['de', 'en'])).toBeNull();
  });
});
