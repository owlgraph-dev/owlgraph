// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

export const DEFAULT_PROPERTY_GROUP = 'core';

// Query-template parameters reuse the semanticProperty mark but are slots the
// query builder's mapping binds, not properties. No property_groups row exists
// for this group, which keeps it out of every listing; the server refuses a
// group, definition or manual property in it.
export const PARAMETER_GROUP = 'parameter';

export function isParameterName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(`${PARAMETER_GROUP}:`);
}

// "parameter:package_name" -> "package_name"; any other name is unchanged.
export function parameterLocalName(name: string): string {
  return isParameterName(name) ? name.slice(PARAMETER_GROUP.length + 1) : name;
}

export interface PropertyDefinitionLike {
  name: string;
  label: string;
  datatype: string;
  // What the field is for — shown as the field's hint where it is edited.
  description?: string;
}

// Only a group attached at two levels collides; the nearer one wins, so a node
// never shows a field twice. Order within a group is kept.
export function mergeChainDefinitions<T extends PropertyDefinitionLike>(chain: { slug: string; definitions: T[] }[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const link of chain) {
    for (const d of link.definitions) {
      if (seen.has(d.name)) continue;
      seen.add(d.name);
      out.push(d);
    }
  }
  return out;
}
export interface PropertyValue {
  name: string;
  value: string;
}
export interface ClassPropertySlot extends PropertyDefinitionLike {
  value: string; // the node's page-wide (manual) value, '' when unset
}
export interface ClassPropertyConflict {
  name: string;
  label: string;
  inlineValues: string[];
  manualValue: string;
}

// A class's definitions are presets over the manual properties
// (docs/architecture/semantic-layer.md): each is a slot, except one the content asserts
// inline, which wins. A stale manual value beside it is a conflict for the UI
// to report; nothing is dropped here.
export function classPropertySlots(
  definitions: PropertyDefinitionLike[],
  manual: PropertyValue[],
  inline: PropertyValue[] = []
): { slots: ClassPropertySlot[]; conflicts: ClassPropertyConflict[]; free: PropertyValue[] } {
  const definitionNames = new Set(definitions.map((d) => d.name));
  const manualValue = (name: string) => manual.find((p) => p.name === name)?.value ?? '';
  const slots: ClassPropertySlot[] = [];
  const conflicts: ClassPropertyConflict[] = [];
  for (const d of definitions) {
    const inlineValues = inline.filter((p) => p.name === d.name).map((p) => p.value);
    if (inlineValues.length === 0) {
      slots.push({ ...d, value: manualValue(d.name) });
    } else if (manualValue(d.name) !== '') {
      conflicts.push({ name: d.name, label: d.label, inlineValues, manualValue: manualValue(d.name) });
    }
  }
  return { slots, conflicts, free: manual.filter((p) => !definitionNames.has(p.name)) };
}
