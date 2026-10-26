// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Picker items for the closed-value intrinsic fields, shared by the query
// builder and the graph view's filters so a class reads the same in both.
import * as m from '$lib/paraglide/messages';
import type { NodeClassOption } from '$lib/features/semantic';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';
import { localeName } from '$lib/platform/i18n/localeNames';

export interface PickerItem {
  value: string;
  label: string;
}

export interface NamespaceOption {
  id: string;
  name: string;
}

export function typeItems(): PickerItem[] {
  return [
    { value: 'page', label: m.editor_intrinsic_condition_type_page() },
    { value: 'document', label: m.editor_intrinsic_condition_type_document() },
    { value: 'collection', label: m.editor_intrinsic_condition_type_collection() },
  ];
}

// Every supported language, not just the enabled ones: a node keeps one that
// was disabled since.
export function localeItems(): PickerItem[] {
  return SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: localeName(locale) }));
}

// Indented by depth with an em space (U+2003): the picker's HTML rendering
// collapses a regular space.
const INDENT = ' ';
export function classItems(classOptions: readonly NodeClassOption[]): PickerItem[] {
  return classOptions.map((c) => ({ value: c.id, label: `${INDENT.repeat(Math.max(0, c.depth - 1))}${c.label}` }));
}

export function namespaceItems(namespaces: readonly NamespaceOption[]): PickerItem[] {
  return namespaces.map((n) => ({ value: n.id, label: n.name }));
}
