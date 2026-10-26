// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A user's avatar is an `assets` row (kind 'avatar', scope 'user'); a partial
// unique index on owner_user_id keeps it to one per user.
import { db } from '$lib/platform/db.server';
import { createImageAsset, matchesImageType, ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from './media.server';
import { logEvent, logger } from '$lib/platform/logger.server';
import { CodedError } from '$lib/platform/codedError';

// No GIF.
const ALLOWED_AVATAR_MIME = new Set(
  [...ALLOWED_IMAGE_MIME].filter((mime) => mime !== 'image/gif')
);
const MAX_AVATAR_BYTES = MAX_IMAGE_BYTES;

export interface CurrentAvatar {
  id: string;
  mime: string;
}

export async function getUserAvatarMeta(userId: string): Promise<CurrentAvatar | null> {
  const [row] = await db<{ id: string; mime: string }[]>`
    select id, mime from assets
    where owner_user_id = ${userId} and kind = 'avatar' and scope = 'user'`;
  return row ?? null;
}

// Deletes the old row before inserting the new one, in one transaction: the
// unique index is checked per statement, not at commit.
export async function replaceAvatar(opts: { bytes: Buffer; mime: string; userId: string }): Promise<{ id: string }> {
  if (!ALLOWED_AVATAR_MIME.has(opts.mime)) {
    logEvent(logger, 'upload.rejected', { kind: 'avatar', reason: 'type', bytes: opts.bytes.length });
    throw new CodedError('unsupported_file_type', `Unsupported image type: ${opts.mime || 'unknown'}`, { type: opts.mime || 'unknown' });
  }
  if (opts.bytes.length > MAX_AVATAR_BYTES) {
    logEvent(logger, 'upload.rejected', { kind: 'avatar', reason: 'size', bytes: opts.bytes.length });
    throw new CodedError('too_large', `Image too large (max ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB).`, { limit: Math.round(MAX_AVATAR_BYTES / 1024 / 1024) });
  }
  if (!matchesImageType(opts.mime, opts.bytes)) {
    logEvent(logger, 'upload.rejected', { kind: 'avatar', reason: 'content', bytes: opts.bytes.length });
    throw new CodedError('invalid_file_content', `Not a ${opts.mime} file.`);
  }

  return db.begin(async (sql) => {
    await sql`delete from assets where owner_user_id = ${opts.userId} and kind = 'avatar' and scope = 'user'`;
    const { id } = await createImageAsset(
      {
        bytes: opts.bytes,
        mime: opts.mime,
        ownerPageId: null,
        ownerUserId: opts.userId,
        createdBy: opts.userId,
        kind: 'avatar',
        scope: 'user',
      },
      sql
    );
    return { id };
  });
}

export async function removeAvatar(userId: string): Promise<void> {
  await db`delete from assets where owner_user_id = ${userId} and kind = 'avatar' and scope = 'user'`;
}
