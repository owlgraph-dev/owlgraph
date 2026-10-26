// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A plugin step that threw is logged by its error's class and the step, never by
// its message, which may quote what the plugin read (a parser quotes its input,
// an address may carry a credential). The stack's frames stay: they name code, not data.
import { errorClass, logEvent, type Logger } from '$lib/platform/logger.server';

/** Without the message the stack's first lines repeat. */
function framesOf(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  const frames = error.stack.split('\n').filter((line) => /^\s+at /.test(line));
  return frames.length ? frames.join('\n') : undefined;
}

export function pluginFailed(log: Logger, step: string, error: unknown): void {
  logEvent(log, 'error.unhandled', { errorClass: errorClass(error), message: `${step} failed`, stack: framesOf(error) });
}
