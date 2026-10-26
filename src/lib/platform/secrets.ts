// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Why a deployment secret is unfit for production, or null: a placeholder from
// .env.example or anything short enough to guess. No judgement of entropy.
const PLACEHOLDERS = new Set(['change-me', 'changeme', 'password', 'secret', 'postgres', 'admin', 'user']);
const MIN_SECRET_LENGTH = 16;

export function weakSecretReason(value: string | undefined | null): string | null {
  if (!value) return 'is not set';
  if (PLACEHOLDERS.has(value.toLowerCase())) return 'is still a placeholder value';
  if (value.length < MIN_SECRET_LENGTH) return `is shorter than ${MIN_SECRET_LENGTH} characters`;
  return null;
}

// The password embedded in a postgres:// connection URL (percent-decoded).
export function urlPassword(connectionUrl: string | undefined): string | null {
  if (!connectionUrl) return null;
  try {
    return decodeURIComponent(new URL(connectionUrl).password) || null;
  } catch {
    return null;
  }
}
