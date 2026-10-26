// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The design-system a11y spec (docs/architecture/design-system/overview.md, "Guardrails"). What a
// field, a field row, the toasts, a command search and a sheet page do is
// specimens.svelte.test.ts's.
import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { authState } from '$tests/e2e/seed-data';
import { touchTargets } from '$tests/e2e/responsive';

test.use({ storageState: authState('admin') });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const sectionIds = (page: Page) =>
  page.locator('[data-playground]').evaluateAll((els) => els.map((e) => e.getAttribute('data-playground') ?? ''));

// Under `vite dev` a first visit can trigger a full reload just after load, so
// settle on network idle there; the build reloads nothing.
async function open(page: Page, url: string) {
  await page.goto(url);
  if (process.env.E2E_SERVER === 'dev') await page.waitForLoadState('networkidle');
  await page.locator('[data-playground]').first().waitFor();
  // The playground pins a dark run's scheme on <body> as it hydrates.
  if (url.includes('scheme=dark')) await page.waitForFunction(() => document.body.dataset.scheme === 'dark');
}

// The colour-dependent checks run once per scheme: each must meet the same bars.
const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];
const pg = (scheme: Scheme, section?: string) => {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (scheme === 'dark') params.set('scheme', 'dark');
  const query = params.toString();
  return `/dev/design-system${query ? `?${query}` : ''}`;
};
const titled = (scheme: Scheme, title: string) => (scheme === 'light' ? title : `${title} (dark)`);

// The two axe sweeps run in PARTS tests each: part k takes every PARTS-th
// section, starting at k, so the slices stay even as sections are added.
const PARTS = 4;
const slice = (ids: string[], k: number) => ids.filter((_, i) => i % PARTS === k);
const partLabel = (k: number) => ` (part ${k + 1}/${PARTS})`;

const describeViolations = (prefix: string, violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
  violations.map(
    (v) =>
      `${prefix}: ${v.id} — ${v.help}\n    ${v.nodes
        .map((n) => `${n.target.join(' ')}\n      ${(n.failureSummary ?? '').replace(/\n/g, '\n      ')}`)
        .join('\n    ')}`
  );

// Controls of one size share one height so they line up in a row; a literal
// height, or a frame adding its border on top of the token, fails here.
async function expectHeightTokens(page: Page) {
  await open(page, '/dev/design-system');
  const families: Record<string, string[]> = {
    '--ds-control-h-sm': [
      '.ds-btn-sm:not(.ds-btn-link)',
      '.ds-input-sm',
      '.ds-select-trigger--sm',
      '.ds-numfield-sm',
      '.ds-segmented-sm',
      '.ds-colorpick-trigger',
      '.ds-iconpick-trigger',
      '.ds-trigger-face-ghost.ds-trigger-face-sm',
      '.ds-trigger-face-secondary.ds-trigger-face-sm',
      '[data-playground="combobox"] .combo-input-sm',
      '[data-playground="chip-input"] [data-specimen="sm-empty"] .ds-chip-input',
    ],
    '--ds-control-h-md': [
      '.ds-btn-md:not(.ds-btn-link)',
      '.ds-input-md',
      '.ds-searchfield',
      '[data-playground="select"] .ds-select-trigger:not(.ds-select-trigger--sm)',
      '[data-playground="combobox"] .combo-input-md',
      '[data-playground="chip-input"] [data-specimen="empty"] .ds-chip-input',
      '.ds-numfield-md',
      '.ds-segmented:not(.ds-segmented-sm)',
      '.ds-trigger-face-secondary.ds-trigger-face-md',
      '.ds-command-search-md',
    ],
    '--ds-control-h-lg': ['.ds-btn-lg:not(.ds-btn-link)', '.ds-input-lg', '.ds-command-search-lg'],
    '--ds-toolbar-h-sm': ['.ds-toolbar-button-sm', '.ds-trigger-face-toolbar.ds-trigger-face-sm'],
    '--ds-toolbar-h-md': ['.ds-toolbar-button-md', '.ds-trigger-face-toolbar.ds-trigger-face-md'],
  };
  const problems = await page.evaluate((families) => {
    const out: string[] = [];
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const root = getComputedStyle(document.documentElement);
    for (const [token, selectors] of Object.entries(families)) {
      const raw = root.getPropertyValue(token).trim();
      const expected = raw.endsWith('rem') ? parseFloat(raw) * rem : parseFloat(raw);
      for (const selector of selectors) {
        const scoped = selector.startsWith('[data-playground') ? selector : `[data-playground] ${selector}`;
        const els = [...document.querySelectorAll(scoped)] as HTMLElement[];
        if (els.length === 0) out.push(`${selector}: no specimen renders it (${token})`);
        for (const el of els) {
          const h = el.getBoundingClientRect().height;
          if (h > 0 && Math.abs(h - expected) > 0.5) {
            const where = el.closest('[data-specimen]')?.getAttribute('data-specimen') ?? '?';
            out.push(`${selector} in ${where}: ${h.toFixed(1)}px, ${token} is ${expected}px`);
          }
        }
      }
    }
    return out;
  }, families);
  expect(problems, problems.join('\n')).toEqual([]);
}

test.describe('design-system playground', () => {
  // Independent and read-only, so the workers share them.
  test.describe.configure({ mode: 'parallel' });

  for (const scheme of SCHEMES) {
    // One section at a time (`?section=`): axe over the whole page per section
    // blows the time budget.
    for (let k = 0; k < PARTS; k++) {
    test(titled(scheme, 'every section passes axe at rest') + partLabel(k), { tag: '@branded' }, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, pg(scheme));
      const ids = slice(await sectionIds(page), k);
      const failures: string[] = [];
      for (const id of ids) {
        await open(page, pg(scheme, id));
        const results = await new AxeBuilder({ page }).include('[data-playground]').withTags(TAGS).analyze();
        failures.push(...describeViolations(id, results.violations));
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    test(titled(scheme, 'every overlay passes axe while open') + partLabel(k), { tag: '@branded' }, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, pg(scheme));
      const ids = slice(await sectionIds(page), k);
      const failures: string[] = [];
      for (const sectionId of ids) {
        await open(page, pg(scheme, sectionId));
        const cells = page.locator('[data-overlay]');
        const count = await cells.count();
        for (let i = 0; i < count; i++) {
          const cell = cells.nth(i);
          const id = `${sectionId}/${await cell.getAttribute('data-overlay')}`;
          const mode = await cell.getAttribute('data-overlay-open');
          const trigger = cell.locator('button, a[href], [role="button"], [role="combobox"], input').first();
          await trigger.scrollIntoViewIfNeeded();
          const before = await openLayerCount(page);
          if (mode === 'hover') {
            await trigger.hover();
            await trigger.focus();
          } else {
            await trigger.click();
          }
          // Statically open collapsibles are in `before`, so only the delta counts.
          await expect
            .poll(() => openLayerCount(page), { message: `${id}: nothing opened`, timeout: 3000 })
            .toBeGreaterThan(before);
          // Layers fade in; axe would read text at partial opacity mid-animation.
          await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
          // Open layers are portalled to <body>, outside the section.
          const results = await new AxeBuilder({ page })
            .include('[data-playground]')
            .include('[data-state="open"]')
            .include('[data-state="delayed-open"]')
            .include('[data-state="instant-open"]')
            .withTags(TAGS)
            .analyze();
          failures.push(...describeViolations(id, results.violations));
          await page.keyboard.press('Escape');
          await expect.poll(() => openLayerCount(page), { message: `${id}: Escape did not close it`, timeout: 3000 }).toBe(before);
          // A neutral spot, so the next hover-opened layer starts clean.
          await page.mouse.move(0, 0);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
    }

    test(titled(scheme, 'every focusable shows a focus ring inside its box, at 3:1 against its ground'), { tag: '@branded' }, async ({ page }) => {
      // One Tab per focusable across all sections: grows with the playground.
      test.setTimeout(120_000);
      await open(page, pg(scheme));
      await page.locator('h1').click(); // a neutral starting point for the Tab order
      const problems: string[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < 1500; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const root = el.closest('.pg');
          if (!root) return { key: 'outside', outside: true, ok: true, inside: true, contrast: Infinity, sanctioned: true };
          const specimen = el.closest('[data-specimen]');
          const section = el.closest('[data-playground]');
          const scope = specimen ?? section ?? root;
          const index = Array.from(scope.querySelectorAll('*')).indexOf(el);
          const key = `${section?.getAttribute('data-playground') ?? 'nav'}/${specimen?.getAttribute('data-specimen') ?? '-'}/${el.tagName.toLowerCase()}#${index}`;
          const ringOf = (e: Element) => {
            const cs = getComputedStyle(e);
            const width = parseFloat(cs.outlineWidth);
            const transparent = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(cs.outlineColor) || cs.outlineColor === 'transparent';
            return cs.outlineStyle !== 'none' && width > 0 && !transparent
              ? { offset: parseFloat(cs.outlineOffset), color: cs.outlineColor, shadow: cs.boxShadow }
              : null;
          };
          // The element itself, or a composite frame around it (NumberField,
          // ChipInput, the search bar) that rings on its behalf.
          let n: Element | null = el;
          let ring: { offset: number; color: string; shadow: string } | null = null;
          while (n && n !== scope) {
            ring = ringOf(n);
            if (ring) break;
            n = n.parentElement;
          }
          // Against the ground the ring paints on: an inset ring's is the owner's
          // background, an outward one's its parent's. The two-tone companion
          // passes if either tone reads.
          type Rgba = { r: number; g: number; b: number; a: number };
          const parse = (s: string): Rgba[] =>
            [...s.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)].map((m) => {
              if (m[1]) {
                const p = m[1].split(',').map((x) => parseFloat(x));
                return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
              }
              const [rgb, alpha] = m[2].split('/');
              const p = rgb.trim().split(/\s+/).map((x) => parseFloat(x) * 255);
              return { r: p[0], g: p[1], b: p[2], a: alpha ? parseFloat(alpha) : 1 };
            });
          const lum = ({ r, g, b }: Rgba) => {
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const ratio = (x: Rgba, y: Rgba) => {
            const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
            return (hi + 0.05) / (lo + 0.05);
          };
          let contrast = Infinity;
          if (ring && n) {
            let g: Element | null = ring.offset < 0 ? n : n.parentElement;
            let ground: Rgba = { r: 255, g: 255, b: 255, a: 1 };
            while (g) {
              const bg = parse(getComputedStyle(g).backgroundColor)[0];
              if (bg && bg.a > 0.5) { ground = bg; break; }
              g = g.parentElement;
            }
            const tones = [parse(ring.color)[0], ...(/inset/.test(ring.shadow) ? parse(ring.shadow) : [])].filter(Boolean);
            contrast = Math.max(...tones.map((t) => ratio(t, ground)));
          }
          // The sanctioned suppressions: a dialog's content taking programmatic
          // focus, and a contenteditable document body.
          const sanctioned = el.matches('[role="dialog"], [contenteditable="true"]');
          return { key, outside: false, ok: ring !== null, inside: ring ? ring.offset <= 0 : true, contrast: +contrast.toFixed(2), sanctioned };
        });
        if (!info) break; // focus wrapped to the body: the page is exhausted
        if (seen.has(info.key)) break; // cycled
        seen.add(info.key);
        if (info.outside || info.sanctioned) continue;
        if (!info.ok) problems.push(`${info.key}: no visible focus ring`);
        else if (!info.inside) problems.push(`${info.key}: ring paints outside the box (outline-offset > 0)`);
        else if (info.contrast < 3) problems.push(`${info.key}: ring contrast ${info.contrast}:1 against its ground (needs 3:1)`);
      }
      expect(seen.size, 'the sweep should reach the playground\'s controls').toBeGreaterThan(40);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('controls of one size render at their height token', async ({ page }) => {
    await expectHeightTokens(page);
  });

  for (const scheme of SCHEMES) {
    // docs/architecture/design-system/primitives.md, "Primitive API convention"; one control of each kind.
    test(titled(scheme, 'pressed is one step deeper than hover'), { tag: '@branded' }, async ({ page }) => {
      test.setTimeout(120_000);
      const probes: { section: string; control: string; paint?: string }[] = [
        { section: 'button', control: '[data-specimen="pressed"] .ds-btn-primary' },
        { section: 'button', control: '[data-specimen="pressed"] .ds-btn-secondary' },
        { section: 'button', control: '[data-specimen="pressed"] .ds-btn-ghost' },
        { section: 'button', control: '[data-specimen="pressed"] .ds-btn-danger' },
        { section: 'button', control: '[data-specimen="pressed"] .ds-btn-ghost-danger' },
        { section: 'segmented-control', control: '.ds-segmented-item:not(.ds-segmented-item-active):not([data-disabled])' },
        { section: 'toolbar', control: '.ds-toolbar-button-ghost:not(.ds-toolbar-button-active):not([data-disabled])' },
        { section: 'switch', control: '.ds-switch:not([data-disabled])', paint: '.ds-switch-track' },
        { section: 'checkbox', control: '[data-specimen="unchecked"] .ds-checkbox', paint: '.ds-checkbox-box' },
        { section: 'radio-group', control: '[data-specimen="vertical"] .ds-radio[data-state="unchecked"]', paint: '.ds-radio-dot' },
        // Popover triggers (they open on click, after the press is read; a
        // DropdownMenu opens on pointerdown, so its open look would answer).
        { section: 'trigger-face', control: '[data-specimen="secondary"] button:has(> .ds-trigger-face-secondary.ds-trigger-face-sm)', paint: '.ds-trigger-face' },
        { section: 'trigger-face', control: '[data-specimen="toolbar"] button:has(> .ds-trigger-face-toolbar.ds-trigger-face-icon)', paint: '.ds-trigger-face' },
      ];
      const problems: string[] = [];
      let current = '';
      for (const probe of probes) {
        if (probe.section !== current) {
          await open(page, pg(scheme, probe.section));
          current = probe.section;
        }
        const control = page.locator(`[data-playground="${probe.section}"] ${probe.control}`).first();
        await control.scrollIntoViewIfNeeded();
        const paint = () =>
          control.evaluate((el, sel) => {
            const target = (sel ? el.querySelector(sel) : el) as HTMLElement;
            const s = getComputedStyle(target);
            return `${s.backgroundColor} ${s.borderColor}`;
          }, probe.paint ?? null);
        // Read once a background transition (the switch track's) has run out:
        // the state change starts it on the next frames, then wait for it.
        const settled = () =>
          control.evaluate(async (el) => {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)));
          });
        await control.hover();
        await settled();
        const hover = await paint();
        await page.mouse.down();
        await settled();
        const pressed = await paint();
        await page.mouse.up();
        await page.keyboard.press('Escape');
        await page.mouse.move(0, 0);
        if (pressed === hover) problems.push(`${probe.section} ${probe.control}: pressed paints the same as hover (${hover})`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  // WCAG 2.5.8: a pointer target is at least 24×24 CSS px.
  test('small controls keep a 24px target', async ({ page }) => {
    const probes = [
      { section: 'field-row', control: '.ds-infotip-glyph' },
      { section: 'chip-input', control: '.ds-chip-remove' },
      { section: 'slider', control: '.ds-slider-thumb' },
      { section: 'checkbox', control: '[data-specimen="aria-label"] .ds-checkbox' },
      { section: 'radio-group', control: '.ds-radio' },
      { section: 'trigger-face', control: '[data-specimen="toolbar-sm"] .ds-trigger-face' },
    ];
    const problems: string[] = [];
    for (const probe of probes) {
      await open(page, `/dev/design-system?section=${probe.section}`);
      const box = await page.locator(`[data-playground="${probe.section}"] ${probe.control}`).first().boundingBox();
      if (!box) { problems.push(`${probe.section}: no ${probe.control}`); continue; }
      if (box.width < 23.5 || box.height < 23.5) problems.push(`${probe.section} ${probe.control}: ${box.width.toFixed(1)}×${box.height.toFixed(1)}px`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('a loading button keeps its width and is not dimmed', async ({ page }) => {
    await open(page, '/dev/design-system?section=button');
    const button = page.locator('[data-playground="button"] [data-specimen="loading-toggle"] .ds-btn');
    const before = (await button.boundingBox())!.width;
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    const during = (await button.boundingBox())!.width;
    const opacity = await button.evaluate((el) => getComputedStyle(el).opacity);
    await expect(button.locator('.ds-spinner')).toBeVisible();
    expect(Math.abs(during - before), 'width must not change while loading').toBeLessThan(0.5);
    expect(opacity).toBe('1');
  });

  test('a stretched segmented control keeps labels inside narrow items', async ({ page }) => {
    await open(page, '/dev/design-system?section=segmented-control');
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const items = [...document.querySelectorAll('[data-specimen="stretch-narrow"] .ds-segmented-item')] as HTMLElement[];
      if (items.length === 0) out.push('no narrow stretch specimen');
      for (const item of items) {
        const label = item.querySelector('.ds-segmented-label') as HTMLElement | null;
        if (!label) { out.push('item without a label wrapper'); continue; }
        const i = item.getBoundingClientRect();
        const l = label.getBoundingClientRect();
        if (l.left < i.left - 0.5 || l.right > i.right + 0.5) out.push(`${item.textContent?.trim()}: label ${l.width.toFixed(1)}px overflows its ${i.width.toFixed(1)}px item`);
      }
      return out;
    });
    expect(problems, problems.join('\n')).toEqual([]);
  });

  for (const width of [1280, 400]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, '/dev/design-system');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the page must never scroll horizontally; only a table scrolls, inside its own wrapper').toBeLessThanOrEqual(0);
    });
  }
});

async function openLayerCount(page: Page): Promise<number> {
  // A Tooltip's state is "delayed-open" / "instant-open", every other layer's is "open".
  return page.evaluate(
    () => document.querySelectorAll('[data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]').length
  );
}

// The touch scale (docs/architecture/responsive.md, "Touch").
test.describe('design-system playground on touch', () => {
  test.describe.configure({ mode: 'parallel' });
  test.use({ hasTouch: true });

  test('controls of one size render at their height token', async ({ page }) => {
    await expectHeightTokens(page);
  });

  test("every target is 44px and every field's text 16px", async ({ page }) => {
    // One page load per section, as the sweeps above: grows with the playground.
    test.setTimeout(120_000);
    await open(page, '/dev/design-system');
    const failures: string[] = [];
    for (const id of await sectionIds(page)) {
      await open(page, pg('light', id));
      // The narrow grid's cells are narrower than the block settings panel they stand for,
      // which src/lib/shell/e2e/touch.spec.ts measures itself.
      const found = await touchTargets(page, '[data-playground] [data-specimen]:not([data-specimen="stack-segmented"])');
      failures.push(...found.map((f) => `${id}: ${f}`));
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
