// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A model's refusal: the code is what a caller branches on, the details the
// facts that code carries. The message is English, for the log.

export class CodedError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
    this.details = details;
  }
}

/** Whether `e` is a refusal, and of one of `codes` when they are given. */
export function isCodedError(e: unknown, ...codes: string[]): e is CodedError {
  return e instanceof CodedError && (codes.length === 0 || codes.includes(e.code));
}
