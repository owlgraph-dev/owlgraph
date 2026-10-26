// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The write side of LocalizedText (localizedText.ts). Server-only, so zod stays
// out of the client bundles.
import { z } from 'zod';
import type { LocalizedText } from './localizedText';
import { CodedError } from '../codedError';
import type { JsonArg, TxSql } from '../db.server';
import { SUPPORTED_LOCALES, isSupportedLocale, siteDefaultLocale } from './siteLocales';

// Trimmed, blanks dropped. A disabled language's translation is kept; a key
// outside the catalogues is refused, since it could never be edited or resolved.
const localizedTextSchema = z
  .record(z.string())
  .refine((value) => Object.keys(value).every(isSupportedLocale), {
    message: `Translations may only use the supported languages (${SUPPORTED_LOCALES.join(', ')}).`,
  })
  .transform((value): LocalizedText => {
    const out: LocalizedText = {};
    for (const locale of SUPPORTED_LOCALES) {
      const text = value[locale]?.trim();
      if (text) out[locale] = text;
    }
    return out;
  });

// A value parseLocalizedText has validated, as a JSONB parameter.
export const localizedJson = (sql: TxSql, value: LocalizedText) => sql.json(value as unknown as JsonArg);

/** Validates a LocalizedText for storage; null/undefined is the empty value. */
export function parseLocalizedText(value: unknown): LocalizedText {
  const result = localizedTextSchema.safeParse(value ?? {});
  if (!result.success) {
    throw new CodedError('invalid_translations', result.error.issues[0]?.message ?? 'Invalid translations.', { languages: SUPPORTED_LOCALES.join(', ') });
  }
  return result.data;
}

/**
 * Reads a LocalizedTextField's `<name>.<locale>` inputs (a disabled language's
 * too, so it survives the save). `required` demands the site default language;
 * `what` names the field in the English message, `name` in the refusal's details.
 */
export function localizedTextFromForm(form: FormData, name: string, { required, what }: { required: boolean; what: string }): LocalizedText {
  const raw: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) raw[locale] = String(form.get(`${name}.${locale}`) ?? '');
  const text = parseLocalizedText(raw);
  const defaultLocale = siteDefaultLocale();
  if (required && !text[defaultLocale]) {
    throw new CodedError('default_text_required', `Enter the ${what} in the default language (${defaultLocale}).`, { field: name, what, locale: defaultLocale });
  }
  return text;
}
