// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The phone the specs emulate (docs/guides/testing.md, "A phone"). Its screen is
// its own size: the project runs as Desktop Chrome, whose 1920×1080 screen
// Playwright forwards to every context, and a phone viewport on that screen is
// a device that does not exist. Chromium judges what a page preloads against
// the screen before the viewport meta applies, so such a "phone" fetches the
// desktop copies too. A spec sets its own pixel ratio.
import type { BrowserContextOptions } from '@playwright/test';

export const PHONE = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
} satisfies BrowserContextOptions;

type Size = { width: number; height: number };

/**
 * Throws for a mobile context whose screen is not the size of its viewport,
 * naming PHONE: the fixtures check every context a test gets or opens.
 */
export function assertPhoneScreen({ isMobile, viewport, screen }: { isMobile?: boolean; viewport?: Size | null; screen?: Size | null }): void {
  if (!isMobile || !viewport) return;
  if (screen?.width === viewport.width && screen?.height === viewport.height) return;
  const shown = screen ? `${screen.width}×${screen.height}` : 'the project’s';
  throw new Error(
    `A mobile context with a ${viewport.width}×${viewport.height} viewport has ${shown} screen; a phone's screen is its own size. ` +
      'Spread PHONE from tests/e2e/devices.ts (docs/guides/testing.md, "A phone").'
  );
}
