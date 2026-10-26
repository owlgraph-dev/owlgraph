// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block this build cannot show leaves a page only on purpose (docs/architecture/blocks/anatomy.md,
// "Unknown blocks"): a write that would drop one its writer didn't acknowledge
// by key is refused before anything is written. The server enforces it, the
// client reads the refusal.
import { droppedUnits, isUnknownKey, type UnknownUnit } from '$lib/features/content';
import { CodedError, isCodedError } from '$lib/platform/codedError';

/** Comma-separated keys a whole-document save acknowledges. */
export const ACKNOWLEDGE_DROPPED_HEADER = 'x-acknowledge-dropped';

/** The code of the refusal a write that would drop one answers. */
export const UNKNOWN_DROPPED_CODE = 'unknown_blocks_dropped';

export type UnknownDroppedError = CodedError & { code: typeof UNKNOWN_DROPPED_CODE; details: { dropped: UnknownUnit[] } };

/** Anything that isn't a key is ignored. */
export function parseAcknowledged(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(isUnknownKey);
}

export function describeDropped(dropped: readonly UnknownUnit[]): string {
  return dropped.map((unit) => `${unit.key} (${unit.type}${unit.count > 1 ? `, ${unit.count} times` : ''})`).join(', ');
}

/** For the log: counts and kinds, never what the blocks hold. */
export function droppedSummary(dropped: readonly UnknownUnit[]): { count: number; types: string[] } {
  return { count: dropped.reduce((sum, unit) => sum + unit.count, 0), types: [...new Set(dropped.map((unit) => unit.type))] };
}

export function isUnknownDropped(e: unknown): e is UnknownDroppedError {
  return isCodedError(e, UNKNOWN_DROPPED_CODE);
}

/** `before` must be counted from the stored doc before anything changes it, both keyed as stored. */
export function assertNoUnknownDropped(before: Map<string, UnknownUnit>, after: Map<string, UnknownUnit>, acknowledged: readonly string[] = []): void {
  if (before.size === 0) return;
  const dropped = droppedUnits(before, after, acknowledged);
  if (!dropped.length) return;
  throw new CodedError(UNKNOWN_DROPPED_CODE, `This would remove blocks this server can't show: ${describeDropped(dropped)}`, { dropped });
}

