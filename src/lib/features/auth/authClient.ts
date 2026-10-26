// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// UI gating only: what the app bar and menus show, never an authorization
// boundary. Every action it gates is enforced on the server (authz.server.ts).
export interface ClientUser {
  role: string;
}

export function canEdit(user: ClientUser | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'editor';
}
