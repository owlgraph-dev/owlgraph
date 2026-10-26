// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The content type scale (docs/architecture/typography.md). Each step renders as
// `var(--type-<step>)`, a :root token in app.css held identical by a test.
// Steps are rem, so they follow the reader's font-size setting; the four
// largest shrink on a narrow canvas, measured in cqi because the canvas, not
// the viewport, is the width that matters in the editor and previews. A
// stored size is `scale:<step>` or a px literal, which does neither.

export const TYPE_SCALE_STEPS = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'] as const;
export type TypeScaleStep = (typeof TYPE_SCALE_STEPS)[number];

export type TypeScaleRef = `scale:${TypeScaleStep}`;
/** A stored font size: a scale step reference, or a literal px number. */
export type TypeSize = TypeScaleRef | number;

export const SIZE_MIN = 8;
export const SIZE_MAX = 96;

/** The px suggestions offered for a custom size. The scale is the primary choice; these are the escape hatch. */
export const CUSTOM_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;

/** The canvas widths (px) a fluid step reaches its floor and its full size at. */
export const FLUID_MIN_CANVAS = 360;
export const FLUID_MAX_CANVAS = 960;
// Only the slope's derivation assumes this root size; everything else stays rem.
const ROOT_PX = 16;

interface ScaleEntry {
  /** Full size. */
  rem: number;
  /** Floor on a narrow canvas; absent for a static step. */
  minRem?: number;
}

export const TYPE_SCALE: Record<TypeScaleStep, ScaleEntry> = {
  xs: { rem: 0.75 },
  s: { rem: 0.875 },
  m: { rem: 1 },
  l: { rem: 1.125 },
  xl: { rem: 1.25 },
  '2xl': { rem: 1.5 },
  // Its floor stays above 2xl, so no two steps meet on a narrow canvas.
  '3xl': { rem: 1.875, minRem: 1.625 },
  '4xl': { rem: 2.25, minRem: 1.75 },
  '5xl': { rem: 3, minRem: 2.125 },
  '6xl': { rem: 3.75, minRem: 2.5 },
};

const PREFIX = 'scale:';

export const TYPE_SCALE_REFS = TYPE_SCALE_STEPS.map((step) => `${PREFIX}${step}`) as [TypeScaleRef, ...TypeScaleRef[]];

function fixed(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** The line through (FLUID_MIN_CANVAS, floor) and (FLUID_MAX_CANVAS, full size), as `interceptRem + slopeCqi·cqi`. */
export function fluidLine(step: TypeScaleStep): { interceptRem: number; slopeCqi: number } | null {
  const { rem, minRem } = TYPE_SCALE[step];
  if (minRem == null) return null;
  const slopeCqi = (((rem - minRem) * ROOT_PX) / (FLUID_MAX_CANVAS - FLUID_MIN_CANVAS)) * 100;
  const interceptRem = minRem - (slopeCqi * FLUID_MIN_CANVAS) / 100 / ROOT_PX;
  return { interceptRem, slopeCqi };
}

/** The value of `--type-<step>` in app.css, which a unit test pins: its rem size, or for a fluid step the clamp() between floor and full size. */
export function typeScaleCss(step: TypeScaleStep): string {
  const { rem, minRem } = TYPE_SCALE[step];
  const line = fluidLine(step);
  if (minRem == null || !line) return `${fixed(rem)}rem`;
  return `clamp(${fixed(minRem)}rem, ${fixed(line.interceptRem)}rem + ${fixed(line.slopeCqi)}cqi, ${fixed(rem)}rem)`;
}

export function isTypeScaleStep(v: unknown): v is TypeScaleStep {
  return typeof v === 'string' && (TYPE_SCALE_STEPS as readonly string[]).includes(v);
}

/** The stored form of a step reference. */
export function scaleRef(step: TypeScaleStep): TypeScaleRef {
  return `${PREFIX}${step}`;
}

/** The step a stored value references, or null for a literal (or anything else). */
export function scaleStepOf(value: unknown): TypeScaleStep | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
  const step = value.slice(PREFIX.length);
  return isTypeScaleStep(step) ? step : null;
}

export function clampSize(v: number): number {
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(v)));
}

/** Every read of a stored size goes through this; a numeric string (an HTML attribute) counts as px. */
export function sizeOrNull(v: unknown): TypeSize | null {
  if (typeof v === 'number') return Number.isFinite(v) ? clampSize(v) : null;
  if (typeof v !== 'string') return null;
  const step = scaleStepOf(v);
  if (step) return scaleRef(step);
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? clampSize(n) : null;
}

/** Every stored size reaches a style through this, so `scale:…` never leaks into CSS. */
export function sizeCss(size: TypeSize): string {
  const step = scaleStepOf(size);
  return step ? `var(--type-${step})` : `${size}px`;
}

/** A size as the UI names it: `2xl`, or `14px`. */
export function sizeLabel(size: TypeSize): string {
  return scaleStepOf(size) ?? `${size}px`;
}

// The picker previews steps on a compressed linear ramp, so xs stays legible
// and 6xl doesn't make the list taller than a popover.
const PREVIEW_MIN_REM = 0.8125;
const PREVIEW_MAX_REM = 1.625;

/** The compressed size a stored size is previewed at outside the canvas: a step's place on the ramp, a px literal clamped into it. */
export function sizePreviewRem(size: TypeSize): string {
  const last = TYPE_SCALE_STEPS.length - 1;
  const step = scaleStepOf(size);
  const rem =
    step != null
      ? PREVIEW_MIN_REM + ((PREVIEW_MAX_REM - PREVIEW_MIN_REM) * TYPE_SCALE_STEPS.indexOf(step)) / last
      : Math.min(PREVIEW_MAX_REM, Math.max(PREVIEW_MIN_REM, Number(size) / ROOT_PX));
  return `${Math.round(rem * 10000) / 10000}rem`;
}

/** The scale as picker options: the stored value, the step's name, its real size, and the (compressed) size to preview it at. */
export function typeScaleOptions(): { value: TypeScaleRef; label: string; hint: string; preview: string }[] {
  return TYPE_SCALE_STEPS.map((step) => ({ value: scaleRef(step), label: step, hint: `${fixed(TYPE_SCALE[step].rem)}rem`, preview: sizePreviewRem(scaleRef(step)) }));
}
