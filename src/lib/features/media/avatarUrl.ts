// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one place the avatar URL is built. Client-safe.
export function avatarUrl(userId: string, avatarVersion: string | null | undefined): string | null {
  return avatarVersion ? `/api/media/avatar/${userId}?v=${avatarVersion}` : null;
}
