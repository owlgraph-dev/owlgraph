// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// `$app/navigation` for component tests: navigation does nothing.
export const goto = async (_url: string | URL, _opts?: unknown): Promise<void> => {};
export const invalidate = async (_dep: unknown): Promise<void> => {};
export const invalidateAll = async (): Promise<void> => {};
export const preloadData = async (_href: string): Promise<unknown> => ({ type: 'loaded', status: 200, data: {} });
export const preloadCode = async (..._urls: string[]): Promise<void> => {};
export const afterNavigate = (_fn: unknown): void => {};
export const beforeNavigate = (_fn: unknown): void => {};
export const onNavigate = (_fn: unknown): void => {};
export const pushState = (_url: string | URL, _state: unknown): void => {};
export const replaceState = (_url: string | URL, _state: unknown): void => {};
export const disableScrollHandling = (): void => {};
