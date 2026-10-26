// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Past BODY_SIZE_LIMIT adapter-node aborts the body with a 413, returned as
// 'too-large' so an upload endpoint doesn't take it for a missing file.
export async function readFormData(request: Request): Promise<FormData | 'too-large' | null> {
  try {
    return await request.formData();
  } catch (e) {
    if ((e as { status?: unknown } | null)?.status === 413) return 'too-large';
    return null;
  }
}
