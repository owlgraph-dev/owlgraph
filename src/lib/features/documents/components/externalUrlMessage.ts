// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared by the create form and the editor's Source panel.
import * as m from '$lib/paraglide/messages';
import type { ExternalUrlError } from '../externalUrl';

export function externalUrlMessage(reason: ExternalUrlError): string {
  if (reason === 'credentials') return m.document_link_error_credentials();
  if (reason === 'too-long') return m.document_link_error_too_long();
  return m.document_link_error_invalid();
}
