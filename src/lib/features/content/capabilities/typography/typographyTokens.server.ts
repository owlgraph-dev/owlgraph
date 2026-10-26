// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Typography tokens: named bundles a paragraph style lays over its base role's
// built-in look (paragraphStyles.server.ts).
import { db } from '$lib/platform/db.server';
import { weightOrNull } from './typography';
import { sizeOrNull, type TypeSize } from './typeScale';
import { CodedError } from '$lib/platform/codedError';

export interface TypographyToken {
  id: string;
  name: string;
  family: string | null;
  size: TypeSize | null; // a type-scale step, or a px literal
  weight: 'normal' | 'medium' | 'semibold' | 'bold' | null;
  lineHeight: number | null;
  letterSpacing: number | null;
}

export function isValidTokenName(name: string): boolean {
  return name.trim().length > 0 && name.length <= 64;
}

// The size column is text: a step reference or a px literal's digits.
function rowToToken(r: {
  id: string;
  name: string;
  family: string | null;
  size: string | null;
  weight: string | null;
  line_height: string | number | null;
  letter_spacing: string | number | null;
}): TypographyToken {
  return {
    id: r.id,
    name: r.name,
    family: r.family,
    size: sizeOrNull(r.size),
    weight: weightOrNull(r.weight),
    lineHeight: r.line_height != null ? Number(r.line_height) : null,
    letterSpacing: r.letter_spacing != null ? Number(r.letter_spacing) : null,
  };
}

export async function listTypographyTokens(): Promise<TypographyToken[]> {
  const rows = await db<
    { id: string; name: string; family: string | null; size: string | null; weight: string | null; line_height: string | number | null; letter_spacing: string | number | null }[]
  >`select id, name, family, size, weight, line_height, letter_spacing from typography_tokens order by name`;
  return rows.map(rowToToken);
}

export interface TypographyTokenInput {
  name: string;
  family: string | null;
  size: TypeSize | null;
  weight: string | null;
  lineHeight: number | null;
  letterSpacing: number | null;
}

// Mirrors the table's CHECK constraints, the source of truth, for a readable message.
export function validateTokenInput(input: TypographyTokenInput): void {
  if (!isValidTokenName(input.name)) throw new CodedError('invalid_token_name', 'Enter a token name (max 64 characters).', { max: 64 });
  if (input.size != null && sizeOrNull(input.size) !== input.size) throw new CodedError('invalid_size', 'Size must be a type-scale step, or between 8 and 96 px.');
  if (input.weight != null && !weightOrNull(input.weight)) throw new CodedError('invalid_weight', 'Invalid weight.');
  if (input.lineHeight != null && (input.lineHeight < 1 || input.lineHeight > 3)) throw new CodedError('invalid_line_height', 'Line height must be between 1 and 3.');
  if (input.letterSpacing != null && (input.letterSpacing < -0.05 || input.letterSpacing > 0.5)) throw new CodedError('invalid_letter_spacing', 'Letter spacing must be between -0.05 and 0.5.');
}

function sizeColumn(size: TypeSize | null): string | null {
  return size == null ? null : String(size);
}

export async function createTypographyToken(input: TypographyTokenInput, createdBy: string | null): Promise<{ id: string }> {
  validateTokenInput(input);
  const [row] = await db<{ id: string }[]>`
    insert into typography_tokens (name, family, size, weight, line_height, letter_spacing, created_by)
    values (${input.name}, ${input.family}, ${sizeColumn(input.size)}, ${input.weight}, ${input.lineHeight}, ${input.letterSpacing}, ${createdBy})
    returning id`;
  return { id: row.id };
}

export async function updateTypographyToken(id: string, input: TypographyTokenInput): Promise<void> {
  validateTokenInput(input);
  await db`
    update typography_tokens
    set name = ${input.name}, family = ${input.family}, size = ${sizeColumn(input.size)}, weight = ${input.weight},
        line_height = ${input.lineHeight}, letter_spacing = ${input.letterSpacing}
    where id = ${id}`;
}

// The FK on paragraph_styles.token_id nulls the reference: those styles fall back to their built-in look.
export async function removeTypographyToken(id: string): Promise<void> {
  await db`delete from typography_tokens where id = ${id}`;
}
