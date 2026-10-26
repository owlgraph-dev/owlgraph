// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/integrations/[plugin], re-exported by src/routes/settings/integrations/[plugin]/+page.server.ts.
// One plugin's settings section (docs/architecture/settings.md, "The integrations group").
import { error, fail } from '@sveltejs/kit';
import { requireAction, settingsChanged } from '$lib/features/auth/routes/requireAction.server';
import {
  countConnections,
  getPluginSettings,
  originOf,
  removeConnections,
  savePluginSettings,
  validateSettings,
  type SettingsInput,
} from '$lib/features/pluginHost/server';
import type { SettingsFieldView } from '$lib/features/pluginHost';
import { secretKeyStatus } from '$lib/platform/secretBox.server';
import { loopbackHttpAllowed, upstreamClient } from '$lib/platform/upstream.server';
import { pluginManifest } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import type { PluginManifest, PluginSettings, PluginSettingsSection } from '$lib/plugins/api';
import * as m from '$lib/paraglide/messages';
import type { Actions, ServerLoadEvent } from '@sveltejs/kit';

type Params = { plugin: string };

const PERMISSION = 'integration:manage' as const;

function sectionOf(pluginId: string): PluginManifest & { settings: PluginSettingsSection } {
  const manifest = pluginManifest(pluginId);
  if (!manifest?.settings) throw error(404, 'Not found');
  return manifest as PluginManifest & { settings: PluginSettingsSection };
}

function fieldViews(section: PluginSettingsSection, settings: PluginSettings): SettingsFieldView[] {
  return section.fields.map((field) => ({
    key: field.key,
    kind: field.kind,
    label: field.label(),
    description: field.description?.() ?? null,
    unit: field.kind === 'number' ? (field.unit?.() ?? null) : null,
    min: field.kind === 'number' ? field.min : null,
    max: field.kind === 'number' ? field.max : null,
    value: settings.values[field.key] == null ? '' : String(settings.values[field.key]),
  }));
}

function readInput(section: PluginSettingsSection, form: FormData): SettingsInput {
  const values: Record<string, string> = {};
  for (const field of section.fields) values[field.key] = String(form.get(field.key) ?? '');
  return { enabled: form.get('enabled') === 'on', values };
}

export const load = async ({ params, locals }: ServerLoadEvent<Params>) => {
  requireAction(locals.user, PERMISSION, locals.log);
  const manifest = sectionOf(params.plugin);
  const settings = await getPluginSettings(manifest);
  return {
    plugin: { id: manifest.id, label: manifest.label(), intro: manifest.settings.intro() },
    enabled: settings.enabled,
    fields: fieldViews(manifest.settings, settings),
    canCheck: Boolean(pluginServer(manifest.id)?.settings?.check),
    // The total counts revoked connections too: they still hold a credential to clear.
    connections: manifest.connections ? await countConnections(manifest.id) : null,
  };
};

export const actions = {
  save: async ({ params, request, locals }) => {
    requireAction(locals.user, PERMISSION, locals.log);
    const manifest = sectionOf(params.plugin);
    const input = readInput(manifest.settings, await request.formData());
    const { settings, problems } = validateSettings(manifest.settings, input, {
      allowLoopbackHttp: loopbackHttpAllowed(),
      secretKeyConfigured: secretKeyStatus().configured,
    });
    // The plugin's own checks only run on values that passed the core's.
    const messages = Object.keys(problems).length === 0 ? (pluginServer(manifest.id)?.settings?.validate?.(settings.values) ?? {}) : {};
    if (Object.keys(problems).length > 0 || Object.keys(messages).length > 0) {
      return fail(400, { input, problems, messages });
    }
    const before = await getPluginSettings(manifest);
    const after = await savePluginSettings(manifest, settings);
    settingsChanged(locals.log, locals.user, {
      section: `integrations/${manifest.id}`,
      permission: PERMISSION,
      operation: 'save',
      from: before.enabled,
      to: after.enabled,
      payload: JSON.stringify(after.values),
    });
    // A connection is made for one address and never sent to another: a new one ends those made for the old.
    const dropped = manifest.connections && locals.user ? (await removeConnections(manifest.id, { reason: 'origin_changed', actorId: locals.user.id, log: locals.log })).removed : 0;
    return { saved: true, dropped };
  },

  disconnectAll: async ({ params, locals }) => {
    requireAction(locals.user, PERMISSION, locals.log);
    const manifest = sectionOf(params.plugin);
    if (!manifest.connections || !locals.user) throw error(404, 'Not found');
    const { removed, notAsked } = await removeConnections(manifest.id, { reason: 'admin', actorId: locals.user.id, log: locals.log });
    return { cleared: removed, notAsked };
  },

  check: async ({ params, request, locals }) => {
    requireAction(locals.user, PERMISSION, locals.log);
    const manifest = sectionOf(params.plugin);
    const check = pluginServer(manifest.id)?.settings?.check;
    if (!check) throw error(404, 'Not found');
    const input = readInput(manifest.settings, await request.formData());
    // The probe asks the address as typed; whether it is on yet does not matter.
    const { settings, problems } = validateSettings(manifest.settings, { ...input, enabled: false }, {
      allowLoopbackHttp: loopbackHttpAllowed(),
      secretKeyConfigured: secretKeyStatus().configured,
    });
    const originField = manifest.settings.fields.find((f) => f.kind === 'origin');
    const origin = originOf(manifest.settings, settings);
    if (!originField || !origin || problems[originField.key]) {
      return fail(400, { input, problems: originField ? { [originField.key]: problems[originField.key] ?? 'required' } : problems, messages: {} });
    }
    const checked = await check(upstreamClient(origin), settings.values).catch(() => ({ ok: false, message: m.settings_integration_check_failed() }));
    return { input, checked };
  },
} satisfies Actions<Params>;
