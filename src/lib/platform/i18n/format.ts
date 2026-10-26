// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Dates and numbers in the interface language, never the browser's default.
// getLocale() is the request's on the server and the viewer's in the browser.
import { getLocale } from '$lib/paraglide/runtime';

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(date));
}

export function formatDateTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

export function formatTime(date: Date | string | number): string {
  return new Intl.DateTimeFormat(getLocale(), { timeStyle: 'short' }).format(new Date(date));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}
