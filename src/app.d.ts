// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { SessionUser } from '$lib/features/auth';
import type { Locale } from '$lib/paraglide/runtime';
import type { ColorPref } from '$lib/design-system/theme/preference';
import type { Logger } from '$lib/platform/logger.server';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      /** The session's stored id (sha256 of its token), which state bound to one session keys by. */
      sessionId: string | null;
      locale: Locale;
      colorPref: ColorPref;
      /** This response's style-src nonce (platform/csp.ts). */
      styleNonce: string;
      /** On every line the request logs, and shown as the error ID (docs/architecture/logging.md). */
      reqId: string;
      /** The request logger: a child bound to { reqId, routeId, userId }. Log through this, never the root logger. */
      log: Logger;
    }
    /** `id` is the request's reqId, which a user can quote (docs/architecture/logging.md, "Correlation"). */
    interface Error {
      message: string;
      id?: string;
    }
  }
}

export {};
