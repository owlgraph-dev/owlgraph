// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A plugin's settings against its manifest's fields (docs/architecture/plugins.md, "Settings").
// The core checks every field by its kind, so a plugin's own checks only add to them.
import type { PluginSettings, PluginSettingsSection, PluginSettingsValues } from '$lib/plugins/api';
import { parseUpstreamOrigin } from '$lib/platform/upstream.server';
import type { SettingsFieldProblem } from './types';

/** The settings of a plugin nobody configured: off, every origin unset, every number its default. */
export function defaultSettings(section: PluginSettingsSection): PluginSettings {
  const values: Record<string, string | number | null> = {};
  for (const field of section.fields) values[field.key] = field.kind === 'number' ? field.default : null;
  return { enabled: false, values };
}

/**
 * Read leniently: a value that is missing or no longer fits its field (an http origin once loopback
 * http is no longer allowed) falls back to the default, and a key no field declares is dropped.
 */
export function storedSettings(section: PluginSettingsSection, raw: unknown, opts: { allowLoopbackHttp: boolean }): PluginSettings {
  const settings = defaultSettings(section);
  if (!raw || typeof raw !== 'object') return settings;
  const stored = raw as { enabled?: unknown; values?: unknown };
  const given = stored.values && typeof stored.values === 'object' ? (stored.values as Record<string, unknown>) : {};
  const values: Record<string, string | number | null> = { ...settings.values };
  for (const field of section.fields) {
    const value = given[field.key];
    if (field.kind === 'number') {
      if (typeof value === 'number' && Number.isInteger(value) && value >= field.min && value <= field.max) values[field.key] = value;
    } else if (typeof value === 'string') {
      const parsed = parseUpstreamOrigin(value, opts);
      if ('origin' in parsed) values[field.key] = parsed.origin;
    }
  }
  return { enabled: stored.enabled === true, values };
}

/** A settings form's switch and each field's text as typed. */
export interface SettingsInput {
  enabled: boolean;
  values: Readonly<Record<string, string>>;
}

/**
 * Problems are keyed by field ('enabled' for the switch). An origin may stay empty while the
 * integration is off; turning it on needs every origin, and a secret key to seal with.
 */
export function validateSettings(
  section: PluginSettingsSection,
  input: SettingsInput,
  opts: { allowLoopbackHttp: boolean; secretKeyConfigured: boolean }
): { settings: PluginSettings; problems: Readonly<Record<string, SettingsFieldProblem>> } {
  const values: Record<string, string | number | null> = {};
  const problems: Record<string, SettingsFieldProblem> = {};
  for (const field of section.fields) {
    const text = (input.values[field.key] ?? '').trim();
    if (field.kind === 'number') {
      if (text === '') {
        values[field.key] = field.default;
      } else if (!/^-?\d{1,12}$/.test(text)) {
        problems[field.key] = 'not-a-number';
      } else {
        const n = Number(text);
        if (n < field.min || n > field.max) problems[field.key] = 'out-of-range';
        else values[field.key] = n;
      }
    } else if (text === '') {
      values[field.key] = null;
      if (input.enabled) problems[field.key] = 'required';
    } else {
      const parsed = parseUpstreamOrigin(text, { allowLoopbackHttp: opts.allowLoopbackHttp });
      if ('origin' in parsed) values[field.key] = parsed.origin;
      else problems[field.key] = parsed.problem === 'insecure' ? 'origin-insecure' : 'origin-invalid';
    }
  }
  if (input.enabled && !opts.secretKeyConfigured) problems.enabled = 'no-secret-key';
  return { settings: { enabled: input.enabled, values: values as PluginSettingsValues }, problems };
}

export function originOf(section: PluginSettingsSection | undefined, settings: PluginSettings): string | null {
  const field = section?.fields.find((f) => f.kind === 'origin');
  const value = field ? settings.values[field.key] : null;
  return typeof value === 'string' ? value : null;
}
