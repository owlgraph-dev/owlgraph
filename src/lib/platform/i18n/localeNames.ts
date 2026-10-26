// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The languages' names (docs/architecture/languages.md), so a language is named in one place.
import type { Locale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';

// Each language in its own name (an autonym), so a reader finds theirs in
// any interface language.
const NAMES: Record<Locale, () => string> = {
  de: m.locale_switcher_german,
  en: m.locale_switcher_english,
};

export function localeName(locale: Locale): string {
  return NAMES[locale]();
}

// Each language in the interface's language, for a sentence that names one.
const NAMES_IN_UI: Record<Locale, () => string> = {
  de: m.locale_name_de,
  en: m.locale_name_en,
};

export function localeNameInUi(locale: Locale): string {
  return NAMES_IN_UI[locale]();
}
