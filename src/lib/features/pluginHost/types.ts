// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the integrations feature's server half hands its pages; safe on either side.

/** Why a settings value was refused; the settings page words each one. */
export type SettingsFieldProblem =
  /** An origin is needed to turn the integration on. */
  | 'required'
  /** Not an address at all, or not a bare origin (a path, a query, credentials). */
  | 'origin-invalid'
  /** Plain http to a host that is not this machine. */
  | 'origin-insecure'
  | 'not-a-number'
  | 'out-of-range'
  /** Turning it on needs APP_SECRET_KEY, which this deployment lacks. */
  | 'no-secret-key';

/** A mirrored collection's source as its editor's source panel shows it, in the interface's words. */
export interface CollectionSourceView {
  pluginLabel: string;
  /** What the integration says of the source; null when it says nothing or is gone. */
  summary: { name: string; detail: string | null; checkedAt: string | null; problem: string | null } | null;
  /** The form that connects the collection anew; null when its integration offers none. */
  form: { fields: { key: string; kind: 'url' | 'password'; label: string; description: string | null; required: boolean }[] } | null;
}

/** A settings field as the settings page draws it, its value as the input shows it. */
export interface SettingsFieldView {
  key: string;
  kind: 'origin' | 'number';
  label: string;
  description: string | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  value: string;
}

/** A person's connection as their connections page shows it: never the credential. */
export interface ConnectionView {
  /** Who they are at the service. */
  accountLabel: string;
  /** `moved`: made against another address than the one set up now. */
  state: 'active' | 'revoked' | 'moved';
  /** ISO timestamps. */
  since: string;
  lastUsed: string | null;
}

/** One integration on the connections page. */
export interface ServiceConnectionView {
  id: string;
  label: string;
  intro: string;
  /** Turned on with an address, which connecting needs. */
  available: boolean;
  connection: ConnectionView | null;
  /** Where this session's connect in progress is approved; null when none is. */
  approveUrl: string | null;
}

/** An action in a node page's header: a path on this app, or an address at the integration's own service. */
export interface NodeSourceAction {
  id: string;
  label: string;
  href: string;
  /** At the service: opened in a tab of its own. */
  external: boolean;
}

/** What a node's own page shows of a mirrored node's source, for one viewer (docs/architecture/plugins.md, "Node views"). */
export interface NodeSourceView {
  /** The integration whose node views draw the body. */
  pluginId: string;
  /** The integration's name, for the header's source chip. */
  label: string;
  /** How the node can be read ("Share"), after the name on the chip; null to say nothing. */
  readsVia: string | null;
  /** What the source holds ("37 entries"); null when not known yet. */
  detail: string | null;
  actions: NodeSourceAction[];
  /** What the body starts from: the integration's own plain JSON. */
  data: unknown;
}
