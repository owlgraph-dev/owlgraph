// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A suggestion the author confirms, never applied (docs/architecture/languages.md). Function words
// are frequent and nearly disjoint between languages, so running text decides
// clearly, and a short or mixed text decides nothing.

// Without the words the lists share (in, an, so …), so a hit counts for one language only.
const STOPWORDS: Record<string, ReadonlySet<string>> = {
  de: new Set(
    'der die und den von zu das mit sich des auf für ist im dem nicht ein eine als auch es werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen zum haben nur oder aber vor zur bis mehr durch wurde wurden kann können sein ihre ihr diese dieser dieses zwischen sowie unter wenn'.split(' ')
  ),
  en: new Set(
    'the of and to is that for it as was with be by on not this are or his from at which but have had they you were their one all we can her has there been if more when will would who what its than these other into only some could them may'.split(' ')
  ),
};

/** Fewer words than this decide nothing. */
const MIN_WORDS = 40;
/** The winner's share of function words must reach this… */
const MIN_SHARE = 0.08;
/** …and be this many times the runner-up's. */
const MIN_MARGIN = 2;
/** Only the start of a long text is read. */
const SAMPLE_CHARS = 20_000;

/** Null when the text is too short, too mixed, or in none of `candidates`; a candidate without a word list is ignored. */
export function detectLocale(text: string, candidates: readonly string[]): string | null {
  const words = text.slice(0, SAMPLE_CHARS).toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < MIN_WORDS) return null;
  const scores = candidates
    .filter((locale) => STOPWORDS[locale])
    .map((locale) => {
      const list = STOPWORDS[locale];
      let hits = 0;
      for (const w of words) if (list.has(w)) hits++;
      return { locale, share: hits / words.length };
    })
    .sort((a, b) => b.share - a.share);
  const [best, second] = scores;
  if (!best || best.share < MIN_SHARE) return null;
  if (second && best.share < second.share * MIN_MARGIN) return null;
  return best.locale;
}
