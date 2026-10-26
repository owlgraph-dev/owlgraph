// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Storage values (property_definitions.datatype, a parameter mark's paramType),
// so untranslated tokens.
export const PROPERTY_DATATYPES = ['text', 'longtext', 'number', 'date', 'boolean', 'url', 'page'] as const;

export type PropertyDatatype = (typeof PROPERTY_DATATYPES)[number];

export function isPropertyDatatype(v: unknown): v is PropertyDatatype {
  return typeof v === 'string' && (PROPERTY_DATATYPES as readonly string[]).includes(v);
}

/**
 * A link property's datatype, offered by no form: a LocalizedText stored as
 * JSON, which every surface resolves for its reader (a member's label).
 */
export const LOCALIZED_TEXT_DATATYPE = 'localizedText';
