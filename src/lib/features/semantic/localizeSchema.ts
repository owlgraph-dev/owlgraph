// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every surface runs its rows through these before they leave the server, so a
// picker gets a plain string in the request's locale; only the settings pages
// get the maps (docs/architecture/languages.md). A label falls back to its identifier, never empty.
import { localize, compareLabels, hasText, type LocalizedText } from '$lib/platform/i18n/localizedText';
import type { RelationshipTypeOption } from './relationshipTypeCatalog';

/** A property group as pickers and field captions show it. */
export interface PropertyGroupOption {
  slug: string;
  label: string;
  description: string;
}

export function localizeGroup(g: { slug: string; label: LocalizedText; description: LocalizedText }): PropertyGroupOption {
  return { slug: g.slug, label: localize(g.label, g.slug), description: localize(g.description, '') };
}

/** A property name the editor and the query builder offer, with its label. */
export interface PropertySuggestion {
  name: string;
  label: string;
  datatype: string;
}

export function localizeSuggestion(s: { name: string; label: LocalizedText; datatype: string }): PropertySuggestion {
  return { name: s.name, label: localize(s.label, s.name), datatype: s.datatype };
}

/** Any row keyed by a property name; every other field passes through. */
export function localizeDefinition<T extends { name: string; label: LocalizedText; description: LocalizedText }>(
  d: T
): Omit<T, 'label' | 'description'> & { label: string; description: string } {
  return { ...d, label: localize(d.label, d.name), description: localize(d.description, '') };
}

/** `inverseLabel` stays null when the type has none. */
export function localizeRelationshipType(
  t: { slug: string; label: LocalizedText; inverse_label: LocalizedText | null },
  properties: readonly { name: string; label: LocalizedText; datatype: string }[]
): RelationshipTypeOption {
  return {
    slug: t.slug,
    label: localize(t.label, t.slug),
    inverseLabel: hasText(t.inverse_label) ? localize(t.inverse_label, '') : null,
    properties: properties.map(localizeSuggestion),
  };
}

/** Sorts resolved options the way the viewer's locale sorts text. */
export function byLabel(a: { label: string }, b: { label: string }): number {
  return compareLabels(a.label, b.label);
}

/** "Label (key)" where a label adds something, the bare key where the label
 * resolved to the key itself (an ad hoc property, an untranslated type). */
export function labelWithKey(label: string, key: string): string {
  return label && label !== key ? `${label} (${key})` : key;
}
